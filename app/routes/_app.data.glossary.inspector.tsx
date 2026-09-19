// Raw-data inspector for the glossary, the counterpart to the Document Inspector.
//
// Admin-only. It shows every column of an entry — uuid, search_id, audit columns, the whole
// translations JSON — and cross-checks each row against the Algolia index, because the
// failures that confuse readers live in the gap between the two: one row reachable through
// several index records shows up as several search results that all edit the same row.
//
// Two writes are offered, and neither touches a term or a translation. Deleting an index
// record leaves the entry untouched; the worst case is that it needs re-indexing. Re-indexing
// rebuilds the records from the table, which is the source of truth — every field in a record
// is a projection of a row, so it can always be regenerated.
//
// Both writes run for minutes on the current glossary, so neither is a single request. The
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
import { Check, Copy, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { assertAuthUser } from '~/auth.server';
import { defineAbilityFor } from '~/authorisation';
import { DeleteConfirmDialog } from '~/components/data/DeleteConfirmDialog';
import { formatElapsed, IndeterminateBar, ProgressBar, useElapsedSeconds } from '~/components/data/ProgressBar';
import { ErrorInfo } from '~/components/ErrorInfo';
import { Badge, Button, Input } from '~/components/ui';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { type ReadGlossary } from '~/drizzle/tables';
import { useToast } from '~/hooks/use-toast';
import {
  type EntryIndexRecord,
  type GlossaryIssue,
  type InspectedEntry,
  type OrphanIndexRecord,
  type RemovableRecordClass,
} from '~/services/glossary.analyse';
import { findGlossaryRowsForInspection, inspectGlossary } from '~/services/glossary.inspect';

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
  // Admin-only, like the Document Inspector. The sidebar hides the link; this is the gate
  // that actually holds.
  const ability = defineAbilityFor(user);
  if (ability.cannot('Read', 'Inspector')) {
    throw redirect('/data');
  }

  const searchParams = new URL(request.url).searchParams;
  const query = searchParams.get('q')?.trim() ?? '';
  // Browsing the whole index takes tens of seconds on a glossary this size, so it only runs
  // when asked for. Everything else on the page comes from the database.
  const checkIndex = searchParams.get('index') === '1';

  const [inspection, lookupRows] = await Promise.all([
    inspectGlossary({ checkIndex }),
    query ? findGlossaryRowsForInspection(query) : Promise.resolve([]),
  ]);

  // The removable lists can run to tens of thousands of uuids; the page needs only the counts,
  // and the cleanup job recomputes the lists server-side when it runs.
  const { removable: _removable, ...reportable } = inspection;

  return json({
    inspection: reportable,
    lookupRows,
    query,
    checkIndex,
    canCleanUp: ability.can('Delete', 'Glossary'),
    canReindex: ability.can('Update', 'Glossary'),
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
    throw new Error(`The server returned ${response.status}. Your session may have expired — reload the page.`);
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

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
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
function renderValue(value: unknown) {
  if (value === null || value === undefined) return <span className={`${SUBTLE} italic`}>null</span>;
  if (value === '') return <span className={`${SUBTLE} italic`}>empty string</span>;
  return <span className="break-all">{String(value)}</span>;
}

function CopyButton({ value }: { value: string }) {
  const { toast } = useToast();
  return (
    <button
      title="Copy"
      type="button"
      className={`${SUBTLE} hover:text-foreground shrink-0`}
      onClick={() => {
        navigator.clipboard?.writeText(value);
        toast({ variant: 'default', title: 'Copied', position: 'top-right' });
      }}
    >
      <Copy className="h-3 w-3" />
    </button>
  );
}

function IssueList({ issues }: { issues: GlossaryIssue[] }) {
  return (
    <ul className="space-y-1">
      {issues.map((issue) => (
        <li key={issue.code} className="flex flex-wrap items-baseline gap-2 text-sm">
          <Badge variant={issue.severity === 'error' ? 'destructive' : 'secondary'}>{issue.code}</Badge>
          <span className="text-muted-foreground">{issue.detail}</span>
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
  const translations = row.translations ?? [];
  if (translations.length === 0) {
    return <p className={`${SUBTLE} text-xs italic`}>No translations stored.</p>;
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
  const { begin } = useJobAbort();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const remove = async () => {
    setSubmitting(true);
    try {
      const { deleted, skipped } = await postJob('delete-records', [['objectId', objectID]], begin());
      const kept = skipped[0];
      toast({
        variant: deleted > 0 ? 'default' : 'error',
        title: deleted > 0 ? 'Record deleted' : 'Kept',
        description:
          deleted > 0
            ? 'Deleted 1 search record. The glossary entry itself is untouched.'
            : `This record was kept: ${kept?.reason ?? 'the server refused the delete'}.`,
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
        title: 'Oops!',
        description: errorMessage(error, 'Failed to delete the search record.'),
        position: 'top-right',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <Badge className="gap-1" variant="secondary">
        <Check className="h-3 w-3" /> deleted
      </Badge>
    );
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={submitting}
      title="Delete this search record"
      aria-label={`delete search record ${objectID}`}
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

  if (records.length === 0) {
    return <p className={`${SUBTLE} text-xs italic`}>No search records carry this uuid.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b">
            <th className={`${LABEL} py-1 pr-3 font-medium`}>objectID</th>
            <th className={`${LABEL} py-1 pr-3 font-medium`}>id</th>
            <th className={`${LABEL} py-1 pr-3 font-medium`}>role</th>
            {canCleanUp && <th className={`${LABEL} py-1 font-medium`}>fix</th>}
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
                  <Badge variant="secondary">kept · search_id points here</Badge>
                ) : record.removable ? (
                  <Badge variant="destructive">duplicate</Badge>
                ) : (
                  <Badge variant="secondary">only record · keep</Badge>
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
          Deleting the duplicate leaves {searchId ? 'the kept record' : 'the remaining record'} and the glossary entry
          itself untouched.
          {deleted.length > 0 && ' The counts above still include it until you run the index check again.'}
        </p>
      )}
    </div>
  );
}

function EntryCard({ entry, canCleanUp }: { entry: InspectedEntry; canCleanUp: boolean }) {
  const { row, issues, indexRecords } = entry;
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="gap-2 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-primary text-xl">{row.glossary}</CardTitle>
          <Button size="sm" variant="secondary" onClick={() => setOpen((value) => !value)}>
            {open ? 'Hide columns' : 'Show all columns'}
          </Button>
        </div>
        <div className={`flex flex-wrap items-center gap-2 ${MONO}`}>
          <span>{row.id}</span>
          <CopyButton value={row.id} />
          <span className={SUBTLE}>·</span>
          <span>{row.translations?.length ?? 0} translation(s)</span>
          <span className={SUBTLE}>·</span>
          <span>{indexRecords.length} search record(s)</span>
        </div>
        <IssueList issues={issues} />
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          <section className="space-y-1">
            <h4 className="text-foreground text-sm font-semibold">Columns</h4>
            <ColumnTable row={row} />
          </section>
          <section className="space-y-1">
            <h4 className="text-foreground text-sm font-semibold">translations (json)</h4>
            <TranslationsTable row={row} />
          </section>
          <section className="space-y-1">
            <h4 className="text-foreground text-sm font-semibold">Search index records</h4>
            <IndexRecordsTable records={indexRecords} searchId={row.searchId} canCleanUp={canCleanUp} />
          </section>
        </CardContent>
      )}
    </Card>
  );
}

function LookupCard({ row }: { row: ReadGlossary }) {
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
          <h4 className="text-foreground text-sm font-semibold">translations (json)</h4>
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
      const pointerNote = repointed ? ` ${repointed} row(s) had their search_id corrected.` : '';
      toast({
        variant: 'default',
        title: 'Re-indexed',
        description: `Re-indexed ${indexed} entr(ies) from the database.${pointerNote} Records left at old objectIDs now belong to no entry — run the index check to see them as orphans, then clean them up.`,
        position: 'top-right',
      });
    } catch (error) {
      toast({
        variant: wasCancelled(error) ? 'default' : 'error',
        title: wasCancelled(error) ? 'Stopped' : 'Oops!',
        description: wasCancelled(error)
          ? `Stopped after ${indexed} entr(ies). Those are indexed and stay indexed; run it again to finish the rest.`
          : `${errorMessage(error, 'Failed to re-index the glossary.')} ${indexed} entr(ies) were indexed before it failed.`,
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
              <Loader2 className="h-4 w-4 animate-spin" /> Re-indexing…
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" /> Re-index {entries} entries
            </span>
          )}
        </Button>
        {running && (
          <Button size="sm" onClick={cancel} variant="outline">
            Stop
          </Button>
        )}
        <p className="text-muted-foreground min-w-56 flex-1 text-sm">
          Writes every entry into the index again from the database, keyed by the entry&rsquo;s own uuid. Search stays
          up throughout — records are overwritten in place, never cleared first. Run this after changing what the index
          holds, or when entries are missing from search. It takes about a minute and leaves terms and translations
          untouched. Records left behind at old objectIDs become orphans, which the cleanup below removes.
        </p>
      </div>

      {progress && (
        <div className="space-y-1">
          <ProgressBar max={entries} value={progress.indexed} />
          <p className={`${SUBTLE} text-xs`}>
            {running
              ? `Indexed ${progress.indexed} of about ${entries} entries.`
              : `Indexed ${progress.indexed} entr(ies).`}
            {progress.repointed > 0 && ` ${progress.repointed} search_id(s) corrected.`}
            {running && ' Stopping is safe — the entries already written stay indexed.'}
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
    let firstKeptReason: string | null = null;
    try {
      const { objectIDs, scanned } = await postJob('cleanup-scan', [['recordClass', recordClass]], signal);
      if (objectIDs.length === 0) {
        toast({
          variant: 'default',
          title: 'Nothing to delete',
          description: `Scanned ${scanned} search record(s); none of them are ${label} any more.`,
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
        firstKeptReason = firstKeptReason ?? result.skipped[0]?.reason ?? null;
        setProgress({ phase: 'deleting', deleted, kept, total: objectIDs.length });
      }

      const keptNote = kept ? ` Kept ${kept}: ${firstKeptReason}.` : '';
      toast({
        variant: 'default',
        title: 'Done',
        description: `Scanned ${scanned} search record(s) and deleted ${deleted} (${recordClass}).${keptNote} No glossary entry was changed.`,
        position: 'top-right',
      });
      onFinished();
    } catch (error) {
      toast({
        variant: wasCancelled(error) ? 'default' : 'error',
        title: wasCancelled(error) ? 'Stopped' : 'Oops!',
        description: wasCancelled(error)
          ? `Stopped after deleting ${deleted} record(s). Deletes already made stand; run it again to finish the rest.`
          : `${errorMessage(error, 'Failed to clean up search records.')} ${deleted} record(s) were deleted before it failed.`,
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
              <Loader2 className="h-4 w-4 animate-spin" /> Deleting…
            </span>
          ) : (
            `Delete ${count} ${label}`
          )}
        </Button>
        {submitting && (
          <Button size="sm" onClick={cancel} variant="outline">
            Stop
          </Button>
        )}
        <p className="text-muted-foreground min-w-56 flex-1 text-sm">{blurb}</p>
      </div>

      {progress?.phase === 'scanning' && (
        <div className="space-y-1">
          <IndeterminateBar />
          <p className={`${SUBTLE} text-xs`}>
            Rescanning the whole index to decide what may go — {formatElapsed(elapsed)} so far. Nothing has been deleted
            yet.
          </p>
        </div>
      )}
      {progress?.phase === 'deleting' && (
        <div className="space-y-1">
          <ProgressBar max={progress.total} value={progress.deleted + progress.kept} />
          <p className={`${SUBTLE} text-xs`}>
            Deleted {progress.deleted} of {progress.total} record(s).
            {progress.kept > 0 && ` ${progress.kept} kept — the server judged them still in use.`}
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
  if (!scanning) return null;
  return (
    <div className="w-full space-y-1">
      <IndeterminateBar />
      <p className={`${SUBTLE} text-xs`}>
        Browsing every record in the index — {formatElapsed(elapsed)} so far, usually about a minute.
      </p>
    </div>
  );
}

export default function GlossaryInspector() {
  const { inspection, lookupRows, query, checkIndex, canCleanUp, canReindex } = useLoaderData<typeof loader>();
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

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-primary text-2xl">Glossary Inspector</CardTitle>
          <p className="text-muted-foreground text-sm">
            Cross-checks every glossary row against the Algolia index and shows every stored column. It can rebuild the
            index from the database and delete stray search records; terms and translations are never touched.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="entries" value={stats.entries} />
            <Stat label="translations" value={stats.translations} />
            <Stat label="rows with search_id" value={stats.indexedEntries} />
            <Stat label="index records" value={indexChecked ? stats.indexRecords : null} />
            <Stat tone="bad" label="duplicate records" value={indexChecked ? stats.redundantIndexRecords : null} />
            <Stat tone="bad" label="orphan records" value={indexChecked ? stats.orphanIndexRecords : null} />
          </div>

          {indexChecked && stats.orphanIndexRecords > 0 && (
            <p className="text-muted-foreground text-sm">
              Of {stats.orphanIndexRecords} orphan record(s), {stats.orphansWithLiveTerm} name a term that is still in
              the glossary under a different uuid — entries re-created by an import — and{' '}
              {stats.orphanIndexRecords - stats.orphansWithLiveTerm} name a term that is no longer there at all.
            </p>
          )}

          {indexError && (
            <p className="text-destructive text-sm">
              The search index could not be read, so index checks were skipped: {indexError}
            </p>
          )}

          {!checkIndex && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3">
              <Button asChild size="sm" variant="secondary">
                <Link to={`?${indexCheckParams.toString()}`}>Check the search index</Link>
              </Button>
              {isScanningIndex ? (
                <ScanProgress scanning />
              ) : (
                <p className="text-muted-foreground text-sm">
                  Off by default: it browses every record in the index and takes up to a minute. It finds entries listed
                  more than once in search, entries missing from it, and records left behind by deleted entries.
                </p>
              )}
            </div>
          )}

          {checkIndex && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3">
              <Button size="sm" variant="secondary" disabled={isLoading} onClick={() => revalidator.revalidate()}>
                {isScanningIndex ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Scanning…
                  </span>
                ) : (
                  'Run the check again'
                )}
              </Button>
              {isScanningIndex ? (
                <ScanProgress scanning />
              ) : (
                <p className="text-muted-foreground text-sm">
                  These counts are a snapshot from when the page loaded. Re-run after changing the index, or after
                  changing which Algolia app the site points at.
                </p>
              )}
            </div>
          )}

          {canReindex && <ReindexButton entries={stats.entries} />}

          {indexChecked && canCleanUp && (
            <div className="space-y-3">
              <BulkCleanupButton
                recordClass="duplicates"
                label="duplicate records"
                onFinished={refreshCounts}
                count={stats.redundantIndexRecords}
                title={`Delete ${stats.redundantIndexRecords} duplicate search records?`}
                blurb="Extra records on entries that also have the record their search_id names. Deleting them is what stops an entry appearing several times in search."
                description="The index is rescanned first, and only extra records on entries that still have their own canonical record are deleted. Every entry keeps that record, so nothing leaves search, and no glossary row or translation is touched."
              />
              <BulkCleanupButton
                onFinished={refreshCounts}
                recordClass="orphans-live-term"
                count={stats.orphansWithLiveTerm}
                label="orphan records whose term is still in the glossary"
                title={`Delete ${stats.orphansWithLiveTerm} orphan records with a live term?`}
                blurb="Left over from entries that were re-created under a new uuid. The live entry has its own record, so nothing here is the last copy of anything."
                description="The index is rescanned first. Each of these records names a term that still exists in the glossary under a different uuid, and that live entry keeps its own record. No glossary row or translation is touched."
              />
              <BulkCleanupButton
                dangerous
                onFinished={refreshCounts}
                count={orphansWithoutLiveTerm}
                recordClass="orphans-missing-term"
                label="orphan records whose term is gone"
                title={`Delete ${orphansWithoutLiveTerm} orphan records for terms no longer in the glossary?`}
                description="The index is rescanned first. Nothing in the glossary holds these terms, so deleting costs nothing in search — but it also destroys the only remaining record of what those entries said. Export or copy anything you might want to restore first."
                blurb="No glossary entry holds these terms any more. Each record is the last trace of a deleted entry — it still carries the term, its phonetic and the words of its translations, though not their sutra citations. Look at them in the table below before deleting."
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
          <CardTitle className="text-primary text-xl">Look up an entry</CardTitle>
          <p className="text-muted-foreground text-sm">
            By uuid, search_id, or any part of a term or translation. Shows every column, issues or not.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Form method="get" className="flex items-center gap-2">
            {checkIndex && <input value="1" name="index" type="hidden" />}
            <Input
              name="q"
              autoComplete="off"
              defaultValue={query}
              disabled={isLoading}
              placeholder="法 or 0b3f…-…"
              aria-label="glossary lookup"
            />
            <Button type="submit" className="w-24" disabled={isLoading}>
              {isLoading ? 'Searching…' : 'Look up'}
            </Button>
          </Form>
          {query && lookupRows.length === 0 && !isLoading && (
            <p className="text-muted-foreground text-sm">No entry matches “{query}”.</p>
          )}
          {lookupRows.length > 0 && (
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
                {lookupRows.length} match(es) for “{query}”.
              </p>
              {lookupRows.map((row) => (
                <LookupCard key={row.id} row={row as unknown as ReadGlossary} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
          Entries with issues{' '}
          <span className={`${LABEL} font-normal`}>
            ({entries.length}
            {truncatedEntries ? ` of ${stats.entriesWithIssues}` : ''})
          </span>
        </h3>
        {entries.length === 0 ? (
          <p className="text-muted-foreground text-sm">No issues found.</p>
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
    let firstKeptReason: string | null = null;
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
        firstKeptReason = firstKeptReason ?? result.skipped[0]?.reason ?? null;
        setProgress({ done: deleted + kept, total: objectIDs.length });
      }
      const keptNote = kept ? ` Kept ${kept}: ${firstKeptReason}.` : '';
      toast({
        variant: 'default',
        title: 'Done',
        description: `Deleted ${deleted} search record(s).${keptNote} The glossary entries themselves are untouched.`,
        position: 'top-right',
      });
      setSelected([]);
    } catch (error) {
      toast({
        variant: wasCancelled(error) ? 'default' : 'error',
        title: wasCancelled(error) ? 'Stopped' : 'Oops!',
        description: wasCancelled(error)
          ? `Stopped after deleting ${deleted} record(s). Deletes already made stand.`
          : `${errorMessage(error, 'Failed to delete search records.')} ${deleted} record(s) were deleted before it failed.`,
        position: 'top-right',
      });
    } finally {
      setProgress(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-primary text-xl">Orphan index records</CardTitle>
        <p className="text-muted-foreground text-sm">
          Records whose uuid matches no glossary row. Search drops them, so they cost a result slot and nothing more —
          until a re-import reuses their uuid, at which point that entry starts appearing twice. The last column says
          whether the term itself still exists under a different uuid: if it does, this is a leftover from an entry that
          was re-created, and the live entry has its own record. If it does not, this record is the only remaining trace
          of that term.
        </p>
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
                Select all {shownIds.length} shown
              </label>
              <Button
                size="sm"
                type="button"
                variant="destructive"
                onClick={deleteSelected}
                disabled={submitting || selected.length === 0}
              >
                {submitting ? 'Deleting…' : `Delete ${selected.length} selected`}
              </Button>
              {submitting && (
                <Button size="sm" onClick={cancel} variant="outline">
                  Stop
                </Button>
              )}
            </div>
            {progress && (
              <div className="space-y-1">
                <ProgressBar max={progress.total} value={progress.done} />
                <p className={`${SUBTLE} text-xs`}>
                  {progress.done} of {progress.total} record(s) done.
                </p>
              </div>
            )}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b">
                {canCleanUp && <th className={`${LABEL} py-1 pr-3 font-medium`}>select</th>}
                <th className={`${LABEL} py-1 pr-3 font-medium`}>objectID</th>
                <th className={`${LABEL} py-1 pr-3 font-medium`}>id (no such row)</th>
                <th className={`${LABEL} py-1 pr-3 font-medium`}>glossary</th>
                <th className={`${LABEL} py-1 font-medium`}>term in glossary?</th>
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
                        aria-label={`select ${record.objectID}`}
                        onChange={() => toggle(record.objectID)}
                        checked={selected.includes(record.objectID)}
                      />
                    </td>
                  )}
                  <td className={`py-1 pr-3 ${MONO}`}>{record.objectID}</td>
                  <td className={`py-1 pr-3 ${MONO}`}>{renderValue(record.id)}</td>
                  <td className={`py-1 pr-3 ${MONO}`}>{renderValue(record.glossary)}</td>
                  <td className="py-1">
                    {record.liveRowWithSameTerm ? (
                      <div className={`flex items-center gap-2 ${MONO}`}>
                        <Badge variant="secondary">live</Badge>
                        <span>{record.liveRowWithSameTerm.id}</span>
                        <CopyButton value={record.liveRowWithSameTerm.id} />
                      </div>
                    ) : record.glossary ? (
                      <Badge variant="destructive">term not in glossary</Badge>
                    ) : (
                      <span className={`${SUBTLE} text-xs italic`}>record has no term</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {truncated && (
          <p className="text-muted-foreground text-sm">
            Showing the first {records.length} of {total}. Use the whole-index cleanup above for the rest.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
