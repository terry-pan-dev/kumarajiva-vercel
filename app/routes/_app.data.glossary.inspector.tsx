// Raw-data inspector for the glossary, the counterpart to the Document Inspector.
//
// Admin-only. It shows every column of an entry — uuid, search_id, audit columns, the whole
// translations JSON — and cross-checks each row against the Algolia index, because the
// failures that confuse readers live in the gap between the two: one row reachable through
// several index records shows up as several search results that all edit the same row.
//
// Two index writes are offered, and neither touches a term or a translation. Deleting an index
// record leaves the entry untouched; the worst case is that it needs re-indexing. Re-indexing
// rebuilds the records from the table, which is the source of truth — every field in a record
// is a projection of a row, so it can always be regenerated.
//
// The trash is the one place here that does touch entries: deleting from the glossary page
// only sets deleted_at, and this page is where a trashed entry is restored or deleted for good.
//
// The index writes run for minutes on the current glossary, so neither is a single request. The
// page drives them a step at a time against the job route next door and reports how far it has
// got after each step; see _app.data.glossary.inspector-jobs.ts for why the jobs live there
// rather than in this route's own action.
//
// Colours here are deliberately darker than the muted foreground used elsewhere: this page is
// dense monospace text on the cream card over the grey /data background, where the muted token
// falls below a readable contrast ratio.
import {
  Form,
  Link,
  useLoaderData,
  useNavigation,
  useRevalidator,
  useRouteError,
  useSearchParams,
} from '@remix-run/react';
import { json, redirect, type LoaderFunctionArgs } from '@vercel/remix';
import { Check, Loader2, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { assertAuthUser } from '~/auth.server';
import { defineAbilityFor } from '~/authorisation';
import { CopyButton } from '~/components/data/CopyButton';
import { DeleteConfirmDialog } from '~/components/data/DeleteConfirmDialog';
import { formatElapsed, IndeterminateBar, ProgressBar, useElapsedSeconds } from '~/components/data/ProgressBar';
import { ErrorInfo } from '~/components/ErrorInfo';
import { Badge, Button, Input } from '~/components/ui';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { type ReadGlossary } from '~/drizzle/tables';
import { useToast } from '~/hooks/use-toast';
import { LocalizedError, localizeError, translateKey } from '~/i18n/errors';
import {
  type EntryIndexRecord,
  type GlossaryIssue,
  type InspectedEntry,
  type OrphanIndexRecord,
  type RemovableRecordClass,
} from '~/services/glossary.analyse';
import { findGlossaryRowsForInspection, inspectGlossary, type RecordDeletionResult } from '~/services/glossary.inspect';
import { readTrashedGlossaries } from '~/services/glossary.service';
import { readUsers } from '~/services/user.service';

import type { JobPayloads, JobResponse } from './_app.data.glossary.inspector-jobs';

// The index check browses every record in the index — on the order of 30k records and 20s on
// the current glossary — so this route needs more than the default function budget. The writes
// have their own budget on the job route.
export const config = {
  maxDuration: 300,
};

export function ErrorBoundary() {
  const error = useRouteError();
  return <ErrorInfo error={error} />;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  // Needs Administrate, like the Document Inspector. The sidebar hides the link; this is the gate
  // that actually holds.
  const ability = defineAbilityFor(user);
  if (ability.cannot('Administrate', 'GlossaryData')) {
    throw redirect('/data');
  }

  const searchParams = new URL(request.url).searchParams;
  const query = searchParams.get('q')?.trim() ?? '';
  // Browsing the whole index takes tens of seconds on a glossary this size, so it only runs
  // when asked for. Everything else on the page comes from the database.
  const checkIndex = searchParams.get('index') === '1';

  const [inspection, lookupRows, trash, users] = await Promise.all([
    inspectGlossary({ checkIndex }),
    query ? findGlossaryRowsForInspection(query) : Promise.resolve([]),
    readTrashedGlossaries(),
    readUsers(),
  ]);

  // Who trashed each entry: trashing stamps updated_by, and a uuid alone says nothing.
  const usernames = Object.fromEntries(users.map((u) => [u.id, u.username ?? u.email ?? u.id]));

  // The removable lists can run to tens of thousands of uuids; the page needs only the counts,
  // and the cleanup job recomputes the lists server-side when it runs.
  const { removable: _removable, ...reportable } = inspection;

  return json({
    inspection: reportable,
    lookupRows,
    trash: {
      total: trash.total,
      rows: trash.rows.map((row) => ({ ...row, deletedByName: usernames[row.updatedBy] ?? null })),
    },
    query,
    checkIndex,
    canCleanUp: ability.can('Administrate', 'GlossaryData'),
    canReindex: ability.can('Maintain', 'GlossaryData'),
  });
};

// ─── Driving the jobs ────────────────────────────────────────────────────────

const JOBS_ROUTE = '/data/glossary/inspector-jobs';

// How many records go into one delete request. Small enough that each request is quick — so
// the bar moves often and a cancel takes effect within a second or two — and large enough that
// a sweep of tens of thousands is tens of requests rather than thousands.
const DELETE_CHUNK = 500;

// One step of one job. Plain fetch rather than a Remix fetcher, so the caller can await it in
// a loop and abort it; a fetcher would also revalidate this route's loader after every step,
// and that loader rescans the whole index.
async function postJob<K extends keyof JobPayloads>(
  intent: K,
  fields: [string, string][],
  signal: AbortSignal,
): Promise<JobPayloads[K]> {
  const body = new FormData();
  body.set('intent', intent);
  for (const [name, value] of fields) body.append(name, value);

  const response = await fetch(JOBS_ROUTE, { method: 'POST', body, signal });
  // A lapsed session redirects to the login page, which is HTML rather than the shape below.
  const payload = (await response.json().catch(() => null)) as JobResponse | null;
  if (!payload) {
    throw new LocalizedError('glossary:inspector.errors.sessionExpired', { status: response.status });
  }
  if (!payload.ok) throw new Error(payload.message);
  // The wire type is the union of every job's payload; the intent picks which one this is, and
  // the job route is where that pairing is kept honest.
  return payload as unknown as JobPayloads[K];
}

// An aborted fetch rejects like any other failure; only the caller knows it asked for that.
function wasCancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

// Job errors are LocalizedErrors from this page, or messages the job route already
// translated for the request's language.
function errorMessage(error: unknown, fallback: string, t: (...args: never[]) => unknown): string {
  return error instanceof Error ? localizeError(error, t) : fallback;
}

type Skipped = RecordDeletionResult['skipped'][number];

// Why the server kept a record, in the viewer's language.
function skipReason(skipped: Skipped | undefined, t: (...args: never[]) => unknown): string | null {
  if (!skipped) return null;
  const key = { 'not-in-index': 'notInIndex', canonical: 'canonical', 'last-record': 'lastRecord' }[skipped.code];
  return translateKey(t, `glossary:inspector.skipReasons.${key}`, { term: skipped.term });
}

// Keeps an in-flight job cancellable, and cancels it if the page navigates away mid-run.
function useJobAbort() {
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);
  const begin = useCallback(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    return controller.signal;
  }, []);
  const cancel = useCallback(() => controllerRef.current?.abort(), []);
  return { begin, cancel };
}

// ─── Presentation ────────────────────────────────────────────────────────────

// Values carry the card's own foreground; labels and asides use the muted token.
const MONO = 'font-mono text-xs text-foreground';
const LABEL = 'text-muted-foreground';
const SUBTLE = 'text-muted-foreground';

// Every column of the glossaries table except translations, which gets its own table below.
// Listed explicitly, in table order, so a new column shows up as a missing key rather than
// silently going unseen.
const COLUMNS: { key: keyof ReadGlossary; label: string }[] = [
  { key: 'id', label: 'id' },
  { key: 'glossary', label: 'glossary' },
  { key: 'phonetic', label: 'phonetic' },
  { key: 'subscribers', label: 'subscribers' },
  { key: 'author', label: 'author' },
  { key: 'cbetaFrequency', label: 'cbeta_frequency' },
  { key: 'discussion', label: 'discussion' },
  { key: 'searchId', label: 'search_id' },
  { key: 'createdAt', label: 'created_at' },
  { key: 'updatedAt', label: 'updated_at' },
  { key: 'deletedAt', label: 'deleted_at' },
  { key: 'createdBy', label: 'created_by' },
  { key: 'updatedBy', label: 'updated_by' },
];

// Serialised rows arrive with dates as strings; null and empty string are different states
// worth telling apart when debugging, so neither is rendered as blank.
// `null` stays literal: it is the database value, not prose.
function EmptyValue({ value }: { value: null | undefined | '' }) {
  const { t } = useTranslation('glossary');
  return <span className={`${SUBTLE} italic`}>{value === '' ? t('inspector.entry.emptyString') : 'null'}</span>;
}

function renderValue(value: unknown) {
  if (value === null || value === undefined || value === '') return <EmptyValue value={value} />;
  return <span className="break-all">{String(value)}</span>;
}

// The code stays as the badge, since it is what the stats and logs use; the explanation is
// translated from it.
function IssueList({ issues }: { issues: GlossaryIssue[] }) {
  const { t } = useTranslation('glossary');
  const describe = (issue: GlossaryIssue) => {
    const values = issue.values ?? {};
    const what = [
      values.whitespace && t('inspector.issues.whitespace'),
      values.hiddenCharacters && t('inspector.issues.hiddenCharacters'),
    ]
      .filter(Boolean)
      .join(t('inspector.issues.and'));
    return translateKey(t, `glossary:inspector.issues.details.${issue.code}`, { count: values.count, what });
  };
  return (
    <ul className="space-y-1">
      {issues.map((issue) => (
        <li key={issue.code} className="flex flex-wrap items-baseline gap-2 text-sm">
          <Badge variant={issue.severity === 'error' ? 'destructive' : 'secondary'}>{issue.code}</Badge>
          <span className="text-muted-foreground">{describe(issue)}</span>
        </li>
      ))}
    </ul>
  );
}

function ColumnTable({ row }: { row: ReadGlossary }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <tbody>
          {COLUMNS.map(({ key, label }) => (
            <tr key={label} className="border-b last:border-b-0">
              <th scope="row" className={`${LABEL} w-44 py-1 pr-3 align-top font-medium`}>
                {label}
              </th>
              <td className={`py-1 ${MONO}`}>
                <div className="flex items-start gap-2">
                  {renderValue(row[key])}
                  {(key === 'id' || key === 'searchId') && row[key] ? <CopyButton value={String(row[key])} /> : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// All fields of every stored translation. The keys come from the data rather than a fixed
// list: the JSON column has no schema, so an unexpected key is itself worth seeing.
function TranslationsTable({ row }: { row: ReadGlossary }) {
  const { t } = useTranslation('glossary');
  const translations = row.translations ?? [];
  if (translations.length === 0) {
    return <p className={`${SUBTLE} text-xs italic`}>{t('inspector.entry.noTranslations')}</p>;
  }
  const keys = [...new Set(translations.flatMap((translation) => Object.keys(translation)))];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b">
            <th className={`${LABEL} py-1 pr-3 font-medium`}>#</th>
            {keys.map((key) => (
              <th key={key} className={`${LABEL} py-1 pr-3 font-medium`}>
                {key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {translations.map((translation, index) => (
            <tr key={index} className="border-b align-top last:border-b-0">
              <td className={`${LABEL} py-1 pr-3`}>{index}</td>
              {keys.map((key) => (
                <td key={key} className={`py-1 pr-3 ${MONO}`}>
                  {renderValue(translation[key as keyof typeof translation])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// A trash button that deletes one record, used for fixing a single duplicate in place. It
// reports its own outcome — spinner, then a toast and a struck-through row — because the page
// deliberately does not re-scan the index after a single delete. One record is one quick
// request, so this is the only write here with nothing to show a progress bar for.
function DeleteRecordButton({ objectID, onDeleted }: { objectID: string; onDeleted: () => void }) {
  const { toast } = useToast();
  const { t } = useTranslation(['glossary', 'common']);
  const { begin } = useJobAbort();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const remove = async () => {
    setSubmitting(true);
    try {
      const { deleted, skipped } = await postJob('delete-records', [['objectId', objectID]], begin());
      toast({
        variant: deleted > 0 ? 'default' : 'error',
        title: t(deleted > 0 ? 'inspector.records.deletedTitle' : 'inspector.records.keptTitle'),
        description:
          deleted > 0
            ? t('inspector.records.deletedDescription')
            : t('inspector.records.keptDescription', {
                reason: skipReason(skipped[0], t) ?? t('inspector.records.refused'),
              }),
        position: 'top-right',
      });
      if (deleted > 0) {
        setDone(true);
        onDeleted();
      }
    } catch (error) {
      if (wasCancelled(error)) return;
      toast({
        variant: 'error',
        title: t('common:toast.oops'),
        description: errorMessage(error, t('inspector.records.deleteFailed'), t),
        position: 'top-right',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <Badge className="gap-1" variant="secondary">
        <Check className="h-3 w-3" /> {t('inspector.records.deletedBadge')}
      </Badge>
    );
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={submitting}
      title={t('inspector.records.deleteTooltip')}
      aria-label={t('inspector.records.deleteLabel', { id: objectID })}
      className={`${SUBTLE} hover:text-destructive disabled:pointer-events-none disabled:opacity-60`}
    >
      {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}

// The records carrying one row's uuid. More than one row here is the duplicate: search
// resolves each of them back to the same entry.
function IndexRecordsTable({
  records,
  searchId,
  canCleanUp,
}: {
  records: EntryIndexRecord[];
  searchId: string | null;
  canCleanUp: boolean;
}) {
  // Deleted rows stay visible, struck through, rather than vanishing: the page does not
  // re-scan after a single delete, so a row that disappeared would look like a render bug.
  const [deleted, setDeleted] = useState<string[]>([]);
  const markDeleted = useCallback((objectID: string) => setDeleted((ids) => [...ids, objectID]), []);
  const { t } = useTranslation('glossary');

  if (records.length === 0) {
    return <p className={`${SUBTLE} text-xs italic`}>{t('inspector.records.none')}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b">
            <th className={`${LABEL} py-1 pr-3 font-medium`}>objectID</th>
            <th className={`${LABEL} py-1 pr-3 font-medium`}>id</th>
            <th className={`${LABEL} py-1 pr-3 font-medium`}>{t('inspector.records.role')}</th>
            {canCleanUp && <th className={`${LABEL} py-1 font-medium`}>{t('inspector.records.fix')}</th>}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr
              key={record.objectID}
              className={`border-b last:border-b-0 ${deleted.includes(record.objectID) ? 'line-through opacity-60' : ''}`}
            >
              <td className={`py-1 pr-3 ${MONO}`}>
                <div className="flex items-center gap-2">
                  {record.objectID}
                  <CopyButton value={record.objectID} />
                </div>
              </td>
              <td className={`py-1 pr-3 ${MONO}`}>{renderValue(record.id)}</td>
              <td className="py-1 pr-3">
                {record.canonical ? (
                  <Badge variant="secondary">{t('inspector.records.kept')}</Badge>
                ) : record.removable ? (
                  <Badge variant="destructive">{t('inspector.records.duplicate')}</Badge>
                ) : (
                  <Badge variant="secondary">{t('inspector.records.onlyRecord')}</Badge>
                )}
              </td>
              {canCleanUp && (
                <td className="py-1">
                  {record.removable ? (
                    <DeleteRecordButton objectID={record.objectID} onDeleted={() => markDeleted(record.objectID)} />
                  ) : (
                    <span className={`${SUBTLE} text-xs`}>—</span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {records.length > 1 && (
        <p className={`${SUBTLE} mt-2 text-xs`}>
          {t(searchId ? 'inspector.records.noteKept' : 'inspector.records.noteRemaining')}
          {deleted.length > 0 && t('inspector.records.stillCounted')}
        </p>
      )}
    </div>
  );
}

function EntryCard({ entry, canCleanUp }: { entry: InspectedEntry; canCleanUp: boolean }) {
  const { row, issues, indexRecords } = entry;
  const [open, setOpen] = useState(false);
  const { t } = useTranslation('glossary');

  return (
    <Card>
      <CardHeader className="gap-2 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-primary text-xl">{row.glossary}</CardTitle>
          <Button size="sm" variant="secondary" onClick={() => setOpen((value) => !value)}>
            {t(open ? 'inspector.entry.hideColumns' : 'inspector.entry.showColumns')}
          </Button>
        </div>
        <div className={`flex flex-wrap items-center gap-2 ${MONO}`}>
          <span>{row.id}</span>
          <CopyButton value={row.id} />
          <span className={SUBTLE}>·</span>
          <span>{t('inspector.counts.translation', { count: row.translations?.length ?? 0 })}</span>
          <span className={SUBTLE}>·</span>
          <span>{t('inspector.counts.searchRecord', { count: indexRecords.length })}</span>
        </div>
        <IssueList issues={issues} />
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          <section className="space-y-1">
            <h4 className="text-foreground text-sm font-semibold">{t('inspector.entry.columns')}</h4>
            <ColumnTable row={row} />
          </section>
          <section className="space-y-1">
            <h4 className="text-foreground text-sm font-semibold">{t('inspector.entry.translationsJson')}</h4>
            <TranslationsTable row={row} />
          </section>
          <section className="space-y-1">
            <h4 className="text-foreground text-sm font-semibold">{t('inspector.entry.searchRecords')}</h4>
            <IndexRecordsTable records={indexRecords} searchId={row.searchId} canCleanUp={canCleanUp} />
          </section>
        </CardContent>
      )}
    </Card>
  );
}

function LookupCard({ row }: { row: ReadGlossary }) {
  const { t } = useTranslation('glossary');
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-primary text-xl">{row.glossary}</CardTitle>
        <div className={`flex items-center gap-2 ${MONO}`}>
          <span>{row.id}</span>
          <CopyButton value={row.id} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ColumnTable row={row} />
        <section className="space-y-1">
          <h4 className="text-foreground text-sm font-semibold">{t('inspector.entry.translationsJson')}</h4>
          <TranslationsTable row={row} />
        </section>
      </CardContent>
    </Card>
  );
}

// Rebuilds every record from the table. Offered whether or not the index has been scanned:
// scanning first tells you how bad it is, but the rebuild does not need that answer, and on a
// badly drifted index it is the faster route to a correct one.
//
// No confirm step, because there is nothing to undo — it overwrites each record with what the
// row already says, so the worst outcome of running it needlessly is that every record is
// rewritten identically.
//
// Run a page of entries at a time, with this component holding the cursor, so the minute it
// takes is a filling bar rather than a spinner. Stopping part-way is safe for the same reason
// the whole thing is: the pages already written are correct, and re-running picks the work up
// from the start again without harm.
function ReindexButton({ entries }: { entries: number }) {
  const { toast } = useToast();
  const { t } = useTranslation(['glossary', 'common']);
  const entryCount = (count: number) => t('inspector.counts.entry', { count });
  const { begin, cancel } = useJobAbort();
  // null until the first run; kept after it finishes so the outcome stays on the page.
  const [progress, setProgress] = useState<{ indexed: number; repointed: number } | null>(null);
  const [running, setRunning] = useState(false);

  const start = async () => {
    const signal = begin();
    setRunning(true);
    setProgress({ indexed: 0, repointed: 0 });

    let indexed = 0;
    let repointed = 0;
    let afterId: string | null = null;
    try {
      for (;;) {
        const page: JobPayloads['reindex-page'] = await postJob(
          'reindex-page',
          afterId ? [['afterId', afterId]] : [],
          signal,
        );
        indexed += page.indexed;
        repointed += page.repointed;
        setProgress({ indexed, repointed });
        afterId = page.nextAfterId;
        if (!afterId) break;
      }
      toast({
        variant: 'default',
        title: t('inspector.reindex.doneTitle'),
        description: t('inspector.reindex.doneDescription', {
          entries: entryCount(indexed),
          pointerNote: repointed ? t('inspector.reindex.pointerNote', { count: repointed }) : '',
        }),
        position: 'top-right',
      });
    } catch (error) {
      toast({
        variant: wasCancelled(error) ? 'default' : 'error',
        title: wasCancelled(error) ? t('inspector.jobs.stopped') : t('common:toast.oops'),
        description: wasCancelled(error)
          ? t('inspector.reindex.stoppedDescription', { entries: entryCount(indexed) })
          : t('inspector.reindex.failedDescription', {
              error: errorMessage(error, t('inspector.reindex.failed'), t),
              entries: entryCount(indexed),
            }),
        position: 'top-right',
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={start} disabled={running} variant="secondary" className="shrink-0">
          {running ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> {t('inspector.reindex.running')}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" /> {t('inspector.reindex.button', { count: entries })}
            </span>
          )}
        </Button>
        {running && (
          <Button size="sm" onClick={cancel} variant="outline">
            {t('inspector.jobs.stop')}
          </Button>
        )}
        <p className="text-muted-foreground min-w-56 flex-1 text-sm">{t('inspector.reindex.blurb')}</p>
      </div>

      {progress && (
        <div className="space-y-1">
          <ProgressBar max={entries} value={progress.indexed} />
          <p className={`${SUBTLE} text-xs`}>
            {running
              ? t('inspector.reindex.progressRunning', { indexed: progress.indexed, entries: entryCount(entries) })
              : t('inspector.reindex.progressDone', { entries: entryCount(progress.indexed) })}
            {progress.repointed > 0 && t('inspector.reindex.repointed', { count: progress.repointed })}
            {running && t('inspector.reindex.stopSafe')}
          </p>
        </div>
      )}
    </div>
  );
}

// One bulk action per class of removable record, so an admin can clear the safe duplicates
// without being made to also sweep away records that are the last trace of a deleted entry.
//
// Two steps: a rescan of the whole index, which decides what is in the class, and then the
// deletes in chunks. The split is what makes the sweep reportable — the scan has no total to
// count against and shows a clock, the deletes show a filling bar — and the server re-derives
// per record whether each delete is safe, so the ids passing through the browser between the
// two steps are checked again rather than trusted.
function BulkCleanupButton({
  recordClass,
  count,
  label,
  title,
  blurb,
  description,
  onFinished,
  dangerous = false,
}: {
  recordClass: RemovableRecordClass;
  count: number;
  label: string;
  title: string;
  blurb: string;
  description: string;
  onFinished: () => void;
  dangerous?: boolean;
}) {
  const { toast } = useToast();
  const { t } = useTranslation(['glossary', 'common']);
  const recordCount = (count: number) => t('inspector.counts.record', { count });
  const { begin, cancel } = useJobAbort();
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<
    { phase: 'scanning' } | { phase: 'deleting'; deleted: number; kept: number; total: number } | null
  >(null);
  const submitting = progress !== null;
  const elapsed = useElapsedSeconds(progress?.phase === 'scanning');

  const run = async () => {
    const signal = begin();
    setConfirming(false);
    setProgress({ phase: 'scanning' });

    let deleted = 0;
    let kept = 0;
    let firstKept: Skipped | undefined;
    try {
      const { objectIDs, scanned } = await postJob('cleanup-scan', [['recordClass', recordClass]], signal);
      if (objectIDs.length === 0) {
        toast({
          variant: 'default',
          title: t('inspector.cleanup.nothingTitle'),
          description: t('inspector.cleanup.nothingDescription', {
            records: t('inspector.counts.searchRecord', { count: scanned }),
            label,
          }),
          position: 'top-right',
        });
        onFinished();
        return;
      }

      setProgress({ phase: 'deleting', deleted: 0, kept: 0, total: objectIDs.length });
      for (let start = 0; start < objectIDs.length; start += DELETE_CHUNK) {
        const chunk = objectIDs.slice(start, start + DELETE_CHUNK);
        const result = await postJob(
          'delete-records',
          chunk.map((objectID) => ['objectId', objectID] as [string, string]),
          signal,
        );
        deleted += result.deleted;
        kept += result.skipped.length;
        firstKept = firstKept ?? result.skipped[0];
        setProgress({ phase: 'deleting', deleted, kept, total: objectIDs.length });
      }

      toast({
        variant: 'default',
        title: t('common:toast.done'),
        description: t('inspector.cleanup.doneDescription', {
          scanned: t('inspector.counts.searchRecord', { count: scanned }),
          deleted,
          label,
          keptNote: kept ? t('inspector.jobs.keptNote', { count: kept, reason: skipReason(firstKept, t) }) : '',
        }),
        position: 'top-right',
      });
      onFinished();
    } catch (error) {
      toast({
        variant: wasCancelled(error) ? 'default' : 'error',
        title: wasCancelled(error) ? t('inspector.jobs.stopped') : t('common:toast.oops'),
        description: wasCancelled(error)
          ? t('inspector.cleanup.stoppedDescription', { records: recordCount(deleted) })
          : t('inspector.cleanup.failedDescription', {
              error: errorMessage(error, t('inspector.cleanup.failed'), t),
              records: recordCount(deleted),
            }),
        position: 'top-right',
      });
      if (deleted > 0) onFinished();
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className={`space-y-3 rounded-lg border p-3 ${dangerous ? 'border-destructive/60 bg-destructive/5' : ''}`}>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          className="shrink-0"
          onClick={() => setConfirming(true)}
          disabled={submitting || count === 0}
          variant={dangerous ? 'destructive' : 'secondary'}
        >
          {submitting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> {t('inspector.jobs.deleting')}
            </span>
          ) : (
            t('inspector.cleanup.button', { count, label })
          )}
        </Button>
        {submitting && (
          <Button size="sm" onClick={cancel} variant="outline">
            {t('inspector.jobs.stop')}
          </Button>
        )}
        <p className="text-muted-foreground min-w-56 flex-1 text-sm">{blurb}</p>
      </div>

      {progress?.phase === 'scanning' && (
        <div className="space-y-1">
          <IndeterminateBar />
          <p className={`${SUBTLE} text-xs`}>{t('inspector.cleanup.scanning', { elapsed: formatElapsed(elapsed) })}</p>
        </div>
      )}
      {progress?.phase === 'deleting' && (
        <div className="space-y-1">
          <ProgressBar max={progress.total} value={progress.deleted + progress.kept} />
          <p className={`${SUBTLE} text-xs`}>
            {t('inspector.cleanup.progress', { deleted: progress.deleted, records: recordCount(progress.total) })}
            {progress.kept > 0 && t('inspector.cleanup.progressKept', { count: progress.kept })}
          </p>
        </div>
      )}

      <DeleteConfirmDialog
        title={title}
        onConfirm={run}
        open={confirming}
        submitting={submitting}
        description={description}
        onOpenChange={setConfirming}
      />
    </div>
  );
}

// A null value means "not measured" — distinct from a measured zero, which is good news.
function Stat({ label, value, tone }: { label: string; value: number | null; tone?: 'bad' }) {
  return (
    <div className="rounded-lg border p-3">
      <div
        className={`text-2xl font-semibold ${tone === 'bad' && (value ?? 0) > 0 ? 'text-destructive' : 'text-foreground'}`}
      >
        {value === null ? <span className={SUBTLE}>—</span> : value}
      </div>
      <div className={`${LABEL} text-xs`}>{label}</div>
    </div>
  );
}

// The index scan is a loader, and a loader can only answer once: it browses until Algolia runs
// out of records, with no total to count against and no way to report a partial result through
// a document request. So this is a clock and a moving bar rather than a percentage — honest
// about being unable to say how far along it is, while still showing that it is alive.
function ScanProgress({ scanning }: { scanning: boolean }) {
  const elapsed = useElapsedSeconds(scanning);
  const { t } = useTranslation('glossary');
  if (!scanning) return null;
  return (
    <div className="w-full space-y-1">
      <IndeterminateBar />
      <p className={`${SUBTLE} text-xs`}>{t('inspector.check.progress', { elapsed: formatElapsed(elapsed) })}</p>
    </div>
  );
}

export default function GlossaryInspector() {
  const { inspection, lookupRows, trash, query, checkIndex, canCleanUp, canReindex } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  // Re-running the scan revalidates in place rather than navigating: the URL already carries
  // ?index=1, so a link to it is a no-op and there is nothing to navigate to. Both states count
  // as loading, since both replace everything on the page.
  const revalidator = useRevalidator();
  const isRescanning = revalidator.state === 'loading';
  const isLoading = navigation.state !== 'idle' || isRescanning;
  // Only a load that consults the index gets the slow-scan treatment; a plain lookup does not.
  const isScanningIndex = isLoading && (checkIndex || navigation.location?.search.includes('index=1') === true);

  const { stats, entries, orphanIndexRecords, truncatedEntries, truncatedOrphans, indexError, indexChecked } =
    inspection;
  const issueEntries = Object.entries(stats.issueCounts).filter(([, count]) => count > 0);

  // The counts a cleanup invalidates come from the index scan, so refreshing them means
  // scanning again. Worth it — leaving a page of stale counts next to a button that acts on
  // them is how the wrong thing gets deleted twice — and the scan reports its own progress.
  const refreshCounts = useCallback(() => {
    if (checkIndex) revalidator.revalidate();
  }, [checkIndex, revalidator]);

  // Preserved so running the index check doesn't discard the current lookup.
  const indexCheckParams = new URLSearchParams(searchParams);
  indexCheckParams.set('index', '1');

  const orphansWithoutLiveTerm = stats.orphanIndexRecords - stats.orphansWithLiveTerm;
  const { t } = useTranslation('glossary');

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-primary text-2xl">{t('inspector.title')}</CardTitle>
          <p className="text-muted-foreground text-sm">{t('inspector.description')}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <Stat value={stats.entries} label={t('inspector.stats.entries')} />
            <Stat value={stats.trashedEntries} label={t('inspector.stats.inTrash')} />
            <Stat value={stats.translations} label={t('inspector.stats.translations')} />
            <Stat value={stats.indexedEntries} label={t('inspector.stats.rowsWithSearchId')} />
            <Stat label={t('inspector.stats.indexRecords')} value={indexChecked ? stats.indexRecords : null} />
            <Stat
              tone="bad"
              label={t('inspector.stats.duplicateRecords')}
              value={indexChecked ? stats.redundantIndexRecords : null}
            />
            <Stat
              tone="bad"
              label={t('inspector.stats.orphanRecords')}
              value={indexChecked ? stats.orphanIndexRecords : null}
            />
          </div>

          {indexChecked && stats.orphanIndexRecords > 0 && (
            <p className="text-muted-foreground text-sm">
              {t('inspector.orphanBreakdown', {
                orphans: t('inspector.counts.orphanRecord', { count: stats.orphanIndexRecords }),
                live: stats.orphansWithLiveTerm,
                gone: orphansWithoutLiveTerm,
              })}
            </p>
          )}

          {indexError && <p className="text-destructive text-sm">{t('inspector.indexError', { error: indexError })}</p>}

          {!checkIndex && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3">
              <Button asChild size="sm" variant="secondary">
                <Link to={`?${indexCheckParams.toString()}`}>{t('inspector.check.button')}</Link>
              </Button>
              {isScanningIndex ? (
                <ScanProgress scanning />
              ) : (
                <p className="text-muted-foreground text-sm">{t('inspector.check.hint')}</p>
              )}
            </div>
          )}

          {checkIndex && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3">
              <Button size="sm" variant="secondary" disabled={isLoading} onClick={() => revalidator.revalidate()}>
                {isScanningIndex ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> {t('inspector.check.scanning')}
                  </span>
                ) : (
                  t('inspector.check.runAgain')
                )}
              </Button>
              {isScanningIndex ? (
                <ScanProgress scanning />
              ) : (
                <p className="text-muted-foreground text-sm">{t('inspector.check.snapshotHint')}</p>
              )}
            </div>
          )}

          {canReindex && <ReindexButton entries={stats.entries} />}

          {indexChecked && canCleanUp && (
            <div className="space-y-3">
              <BulkCleanupButton
                recordClass="duplicates"
                onFinished={refreshCounts}
                count={stats.redundantIndexRecords}
                label={t('inspector.cleanup.duplicates.label')}
                blurb={t('inspector.cleanup.duplicates.blurb')}
                description={t('inspector.cleanup.duplicates.description')}
                title={t('inspector.cleanup.duplicates.title', { count: stats.redundantIndexRecords })}
              />
              <BulkCleanupButton
                onFinished={refreshCounts}
                recordClass="orphans-live-term"
                count={stats.orphansWithLiveTerm}
                label={t('inspector.cleanup.orphansLiveTerm.label')}
                blurb={t('inspector.cleanup.orphansLiveTerm.blurb')}
                description={t('inspector.cleanup.orphansLiveTerm.description')}
                title={t('inspector.cleanup.orphansLiveTerm.title', { count: stats.orphansWithLiveTerm })}
              />
              <BulkCleanupButton
                dangerous
                onFinished={refreshCounts}
                count={orphansWithoutLiveTerm}
                recordClass="orphans-missing-term"
                label={t('inspector.cleanup.orphansMissingTerm.label')}
                blurb={t('inspector.cleanup.orphansMissingTerm.blurb')}
                description={t('inspector.cleanup.orphansMissingTerm.description')}
                title={t('inspector.cleanup.orphansMissingTerm.title', { count: orphansWithoutLiveTerm })}
              />
            </div>
          )}

          {issueEntries.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {issueEntries.map(([code, count]) => (
                <Badge key={code} variant="secondary">
                  {code}: {count}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-primary text-xl">{t('inspector.lookup.title')}</CardTitle>
          <p className="text-muted-foreground text-sm">{t('inspector.lookup.description')}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Form method="get" className="flex items-center gap-2">
            {checkIndex && <input value="1" name="index" type="hidden" />}
            <Input
              name="q"
              autoComplete="off"
              defaultValue={query}
              disabled={isLoading}
              aria-label={t('inspector.lookup.label')}
              placeholder={t('inspector.lookup.placeholder')}
            />
            <Button type="submit" className="min-w-24" disabled={isLoading}>
              {t(isLoading ? 'inspector.lookup.searching' : 'inspector.lookup.button')}
            </Button>
          </Form>
          {query && lookupRows.length === 0 && !isLoading && (
            <p className="text-muted-foreground text-sm">{t('inspector.lookup.noMatch', { query })}</p>
          )}
          {lookupRows.length > 0 && (
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
                {t('inspector.lookup.matches', { count: lookupRows.length, query })}
              </p>
              {lookupRows.map((row) => (
                <LookupCard key={row.id} row={row as unknown as ReadGlossary} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <TrashCard total={trash.total} canCleanUp={canCleanUp} rows={trash.rows as unknown as TrashedRow[]} />

      {orphanIndexRecords.length > 0 && (
        <OrphanRecordsCard
          canCleanUp={canCleanUp}
          records={orphanIndexRecords}
          truncated={truncatedOrphans}
          total={stats.orphanIndexRecords}
        />
      )}

      <div className="space-y-4">
        <h3 className="text-foreground text-lg font-semibold">
          {t('inspector.issues.heading')}{' '}
          <span className={`${LABEL} font-normal`}>
            {truncatedEntries
              ? t('inspector.issues.countOf', { shown: entries.length, total: stats.entriesWithIssues })
              : t('inspector.issues.count', { shown: entries.length })}
          </span>
        </h3>
        {entries.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('inspector.issues.none')}</p>
        ) : (
          entries.map((entry) => (
            <EntryCard key={entry.row.id} canCleanUp={canCleanUp} entry={entry as unknown as InspectedEntry} />
          ))
        )}
      </div>
    </div>
  );
}

// Records no entry points at. Selectable individually or all at once, because they come in
// hundreds; the whole-index cleanup above covers the ones past the display cap.
//
// A selection can run to the display cap, which is more than one request should carry, so the
// deletes go out in chunks with a bar across them — the same treatment the whole-index cleanup
// gets, minus the scan it does not need.
function OrphanRecordsCard({
  records,
  total,
  truncated,
  canCleanUp,
}: {
  records: OrphanIndexRecord[];
  total: number;
  truncated: boolean;
  canCleanUp: boolean;
}) {
  const { toast } = useToast();
  const { t } = useTranslation(['glossary', 'common']);
  const recordCount = (count: number) => t('inspector.counts.searchRecord', { count });
  const { begin, cancel } = useJobAbort();
  const [selected, setSelected] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const submitting = progress !== null;

  const shownIds = useMemo(() => records.map((record) => record.objectID), [records]);
  const allSelected = selected.length === shownIds.length && shownIds.length > 0;

  const toggle = (objectID: string) =>
    setSelected((current) =>
      current.includes(objectID) ? current.filter((id) => id !== objectID) : [...current, objectID],
    );

  const deleteSelected = async () => {
    const signal = begin();
    const objectIDs = selected;
    setProgress({ done: 0, total: objectIDs.length });

    let deleted = 0;
    let kept = 0;
    let firstKept: Skipped | undefined;
    try {
      for (let start = 0; start < objectIDs.length; start += DELETE_CHUNK) {
        const chunk = objectIDs.slice(start, start + DELETE_CHUNK);
        const result = await postJob(
          'delete-records',
          chunk.map((objectID) => ['objectId', objectID] as [string, string]),
          signal,
        );
        deleted += result.deleted;
        kept += result.skipped.length;
        firstKept = firstKept ?? result.skipped[0];
        setProgress({ done: deleted + kept, total: objectIDs.length });
      }
      toast({
        variant: 'default',
        title: t('common:toast.done'),
        description: t('inspector.orphans.doneDescription', {
          records: recordCount(deleted),
          keptNote: kept ? t('inspector.jobs.keptNote', { count: kept, reason: skipReason(firstKept, t) }) : '',
        }),
        position: 'top-right',
      });
      setSelected([]);
    } catch (error) {
      toast({
        variant: wasCancelled(error) ? 'default' : 'error',
        title: wasCancelled(error) ? t('inspector.jobs.stopped') : t('common:toast.oops'),
        description: wasCancelled(error)
          ? t('inspector.orphans.stoppedDescription', { records: recordCount(deleted) })
          : t('inspector.orphans.failedDescription', {
              error: errorMessage(error, t('inspector.orphans.failed'), t),
              records: recordCount(deleted),
            }),
        position: 'top-right',
      });
    } finally {
      setProgress(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-primary text-xl">{t('inspector.orphans.title')}</CardTitle>
        <p className="text-muted-foreground text-sm">{t('inspector.orphans.description')}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {canCleanUp && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-muted-foreground flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={allSelected}
                  disabled={submitting}
                  onChange={(event) => setSelected(event.target.checked ? shownIds : [])}
                />
                {t('inspector.selection.selectAll', { count: shownIds.length })}
              </label>
              <Button
                size="sm"
                type="button"
                variant="destructive"
                onClick={deleteSelected}
                disabled={submitting || selected.length === 0}
              >
                {submitting
                  ? t('inspector.jobs.deleting')
                  : t('inspector.orphans.deleteSelected', { count: selected.length })}
              </Button>
              {submitting && (
                <Button size="sm" onClick={cancel} variant="outline">
                  {t('inspector.jobs.stop')}
                </Button>
              )}
            </div>
            {progress && (
              <div className="space-y-1">
                <ProgressBar max={progress.total} value={progress.done} />
                <p className={`${SUBTLE} text-xs`}>
                  {t('inspector.orphans.progress', { done: progress.done, records: recordCount(progress.total) })}
                </p>
              </div>
            )}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b">
                {canCleanUp && <th className={`${LABEL} py-1 pr-3 font-medium`}>{t('inspector.selection.select')}</th>}
                <th className={`${LABEL} py-1 pr-3 font-medium`}>objectID</th>
                <th className={`${LABEL} py-1 pr-3 font-medium`}>{t('inspector.orphans.idNoRow')}</th>
                <th className={`${LABEL} py-1 pr-3 font-medium`}>glossary</th>
                <th className={`${LABEL} py-1 font-medium`}>{t('inspector.orphans.termInGlossary')}</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.objectID} className="border-b last:border-b-0">
                  {canCleanUp && (
                    <td className="py-1 pr-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        disabled={submitting}
                        value={record.objectID}
                        onChange={() => toggle(record.objectID)}
                        checked={selected.includes(record.objectID)}
                        aria-label={t('inspector.selection.selectItem', { item: record.objectID })}
                      />
                    </td>
                  )}
                  <td className={`py-1 pr-3 ${MONO}`}>{record.objectID}</td>
                  <td className={`py-1 pr-3 ${MONO}`}>{renderValue(record.id)}</td>
                  <td className={`py-1 pr-3 ${MONO}`}>{renderValue(record.glossary)}</td>
                  <td className="py-1">
                    {record.inTrash ? (
                      <Badge variant="secondary">{t('inspector.orphans.inTrash')}</Badge>
                    ) : record.liveRowWithSameTerm ? (
                      <div className={`flex items-center gap-2 ${MONO}`}>
                        <Badge variant="secondary">{t('inspector.orphans.live')}</Badge>
                        <span>{record.liveRowWithSameTerm.id}</span>
                        <CopyButton value={record.liveRowWithSameTerm.id} />
                      </div>
                    ) : record.glossary ? (
                      <Badge variant="destructive">{t('inspector.orphans.termGone')}</Badge>
                    ) : (
                      <span className={`${SUBTLE} text-xs italic`}>{t('inspector.orphans.noTerm')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {truncated && (
          <p className="text-muted-foreground text-sm">
            {t('inspector.orphans.truncated', { shown: records.length, total })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Trash ───────────────────────────────────────────────────────────────────

type TrashedRow = ReadGlossary & { deletedByName: string | null };

// How many entries go into one restore or purge request. A purge runs one search per entry to
// find stray records, so this is smaller than the record-delete chunk.
const TRASH_CHUNK = 50;

// Entries deleted from the glossary page. They are out of the glossary, search and editing
// already; here they come back, or go for good. Selectable individually or all at once, and
// each row also has its own restore and delete buttons.
//
// Done rows are hidden locally rather than by revalidating: with the index check on, the loader
// rescans the whole index, which is a minute's wait to learn what this card already knows.
function TrashCard({ rows, total, canCleanUp }: { rows: TrashedRow[]; total: number; canCleanUp: boolean }) {
  const { toast } = useToast();
  const { t } = useTranslation(['glossary', 'common']);
  const entryCount = (count: number) => t('inspector.counts.entry', { count });
  const { begin, cancel } = useJobAbort();
  const [gone, setGone] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  // The ids a permanent delete is waiting on confirmation for — one row's, or the selection.
  const [confirmingPurge, setConfirmingPurge] = useState<string[] | null>(null);
  const [progress, setProgress] = useState<{
    job: 'restore-trash' | 'purge-trash';
    done: number;
    total: number;
  } | null>(null);
  const submitting = progress !== null;

  const visible = useMemo(() => rows.filter((row) => !gone.includes(row.id)), [rows, gone]);
  const shownIds = useMemo(() => visible.map((row) => row.id), [visible]);
  const allSelected = selected.length === shownIds.length && shownIds.length > 0;
  const remaining = total - gone.length;

  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((other) => other !== id) : [...current, id]));

  const run = async (job: 'restore-trash' | 'purge-trash', ids: string[]) => {
    const signal = begin();
    setConfirmingPurge(null);
    setProgress({ job, done: 0, total: ids.length });

    let done = 0;
    let skipped = 0;
    const finished: string[] = [];
    try {
      for (let start = 0; start < ids.length; start += TRASH_CHUNK) {
        const chunk = ids.slice(start, start + TRASH_CHUNK);
        const result = await postJob(
          job,
          chunk.map((id) => ['glossaryId', id] as [string, string]),
          signal,
        );
        done += result.done;
        skipped += result.skipped;
        // Skipped ids have left the trash some other way, so they are hidden as well.
        finished.push(...chunk);
        setGone((current) => [...current, ...chunk]);
        setProgress({ job, done: done + skipped, total: ids.length });
      }
      const skippedNote = skipped ? t('inspector.trash.skippedNote', { count: skipped }) : '';
      toast({
        variant: 'default',
        title: t(job === 'restore-trash' ? 'inspector.trash.restoredTitle' : 'inspector.trash.purgedTitle'),
        description: t(
          job === 'restore-trash' ? 'inspector.trash.restoredDescription' : 'inspector.trash.purgedDescription',
          { entries: entryCount(done), skippedNote },
        ),
        position: 'top-right',
      });
    } catch (error) {
      toast({
        variant: wasCancelled(error) ? 'default' : 'error',
        title: wasCancelled(error) ? t('inspector.jobs.stopped') : t('common:toast.oops'),
        description: wasCancelled(error)
          ? t(job === 'restore-trash' ? 'inspector.trash.stoppedRestoring' : 'inspector.trash.stoppedDeleting', {
              entries: entryCount(done),
            })
          : t('inspector.trash.failedDescription', {
              error: errorMessage(error, t('inspector.trash.failed'), t),
              entries: entryCount(done),
            }),
        position: 'top-right',
      });
    } finally {
      setSelected((current) => current.filter((id) => !finished.includes(id)));
      setProgress(null);
    }
  };

  const purgeCount = confirmingPurge?.length ?? 0;
  const purgeLabel =
    purgeCount === 1
      ? `“${rows.find((row) => row.id === confirmingPurge?.[0])?.glossary ?? ''}”`
      : entryCount(purgeCount);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-primary text-xl">
          {t('inspector.trash.title')}{' '}
          <span className={`${LABEL} text-base font-normal`}>{t('inspector.issues.count', { shown: remaining })}</span>
        </CardTitle>
        <p className="text-muted-foreground text-sm">{t('inspector.trash.description')}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {visible.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t(remaining > 0 ? 'inspector.trash.reloadForRest' : 'inspector.trash.empty')}
          </p>
        ) : (
          <>
            {canCleanUp && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-muted-foreground flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={allSelected}
                      disabled={submitting}
                      onChange={(event) => setSelected(event.target.checked ? shownIds : [])}
                    />
                    {t('inspector.selection.selectAll', { count: shownIds.length })}
                  </label>
                  <Button
                    size="sm"
                    type="button"
                    variant="secondary"
                    disabled={submitting || selected.length === 0}
                    onClick={() => run('restore-trash', selected)}
                  >
                    {progress?.job === 'restore-trash'
                      ? t('inspector.trash.restoring')
                      : t('inspector.trash.restoreSelected', { count: selected.length })}
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    variant="destructive"
                    onClick={() => setConfirmingPurge(selected)}
                    disabled={submitting || selected.length === 0}
                  >
                    {progress?.job === 'purge-trash'
                      ? t('inspector.jobs.deleting')
                      : t('inspector.trash.deletePermanently', { count: selected.length })}
                  </Button>
                  {submitting && (
                    <Button size="sm" onClick={cancel} variant="outline">
                      {t('inspector.jobs.stop')}
                    </Button>
                  )}
                </div>
                {progress && (
                  <div className="space-y-1">
                    <ProgressBar max={progress.total} value={progress.done} />
                    <p className={`${SUBTLE} text-xs`}>
                      {t('inspector.trash.progress', { done: progress.done, entries: entryCount(progress.total) })}
                    </p>
                  </div>
                )}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b">
                    {canCleanUp && (
                      <th className={`${LABEL} py-1 pr-3 font-medium`}>{t('inspector.selection.select')}</th>
                    )}
                    <th className={`${LABEL} py-1 pr-3 font-medium`}>glossary</th>
                    <th className={`${LABEL} py-1 pr-3 font-medium`}>{t('inspector.trash.translations')}</th>
                    <th className={`${LABEL} py-1 pr-3 font-medium`}>deleted_at</th>
                    <th className={`${LABEL} py-1 pr-3 font-medium`}>{t('inspector.trash.deletedBy')}</th>
                    <th className={`${LABEL} py-1 font-medium`}>{t('inspector.trash.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <TrashRow
                      row={row}
                      key={row.id}
                      disabled={submitting}
                      canCleanUp={canCleanUp}
                      expanded={expanded === row.id}
                      selected={selected.includes(row.id)}
                      onToggleSelected={() => toggle(row.id)}
                      onPurge={() => setConfirmingPurge([row.id])}
                      onRestore={() => run('restore-trash', [row.id])}
                      onToggleExpanded={() => setExpanded((current) => (current === row.id ? null : row.id))}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {total > rows.length && (
              <p className="text-muted-foreground text-sm">
                {t('inspector.trash.showingRecent', { shown: rows.length, total })}
              </p>
            )}
          </>
        )}

        <DeleteConfirmDialog
          submitting={submitting}
          open={confirmingPurge !== null}
          onOpenChange={(open) => !open && setConfirmingPurge(null)}
          title={t('inspector.trash.purgeTitle', { what: purgeLabel })}
          onConfirm={() => confirmingPurge && run('purge-trash', confirmingPurge)}
          description={t('inspector.trash.purgeDescription', { count: purgeCount, what: purgeLabel })}
        />
      </CardContent>
    </Card>
  );
}

function TrashRow({
  row,
  canCleanUp,
  disabled,
  selected,
  expanded,
  onToggleSelected,
  onToggleExpanded,
  onRestore,
  onPurge,
}: {
  row: TrashedRow;
  canCleanUp: boolean;
  disabled: boolean;
  selected: boolean;
  expanded: boolean;
  onToggleSelected: () => void;
  onToggleExpanded: () => void;
  onRestore: () => void;
  onPurge: () => void;
}) {
  const translations = row.translations ?? [];
  const columns = canCleanUp ? 6 : 5;
  const { t } = useTranslation('glossary');

  return (
    <>
      <tr className="border-b align-top last:border-b-0">
        {canCleanUp && (
          <td className="py-1 pr-3">
            <input
              type="checkbox"
              checked={selected}
              className="h-4 w-4"
              disabled={disabled}
              onChange={onToggleSelected}
              aria-label={t('inspector.selection.selectItem', { item: row.glossary })}
            />
          </td>
        )}
        <td className="py-1 pr-3">
          <button type="button" onClick={onToggleExpanded} className="text-primary text-left text-sm hover:underline">
            {row.glossary}
          </button>
        </td>
        <td className={`py-1 pr-3 ${MONO}`}>
          {translations.length}
          {translations.length > 0 && (
            <span className={SUBTLE}>
              {' '}
              ·{' '}
              {translations
                .slice(0, 3)
                .map((translation) => translation.glossary)
                .join('; ')}
              {translations.length > 3 && '…'}
            </span>
          )}
        </td>
        <td className={`py-1 pr-3 ${MONO}`}>{renderValue(row.deletedAt)}</td>
        <td className={`py-1 pr-3 ${MONO}`}>{row.deletedByName ?? renderValue(row.updatedBy)}</td>
        <td className="py-1">
          {canCleanUp ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onRestore}
                disabled={disabled}
                title={t('inspector.trash.restore')}
                aria-label={t('inspector.trash.restoreLabel', { term: row.glossary })}
                className={`${SUBTLE} hover:text-foreground disabled:pointer-events-none disabled:opacity-60`}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onPurge}
                disabled={disabled}
                title={t('inspector.trash.purge')}
                aria-label={t('inspector.trash.purgeLabel', { term: row.glossary })}
                className={`${SUBTLE} hover:text-destructive disabled:pointer-events-none disabled:opacity-60`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <span className={`${SUBTLE} text-xs`}>—</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b">
          <td colSpan={columns} className="space-y-4 py-3">
            <ColumnTable row={row} />
            <section className="space-y-1">
              <h4 className="text-foreground text-sm font-semibold">{t('inspector.entry.translationsJson')}</h4>
              <TranslationsTable row={row} />
            </section>
          </td>
        </tr>
      )}
    </>
  );
}
