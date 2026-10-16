import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';

import { json, redirect } from '@remix-run/node';
import { Form, Link, useActionData, useFetcher, useNavigation } from '@remix-run/react';
import { AlertCircle, ArrowLeftRight, CheckCircle2, ChevronRight, FileText } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { assertAuthUser } from '~/auth.server';
import { defineAbilityFor } from '~/authorisation';
import { GlossaryFileColumns } from '~/components/data/GlossaryFileColumns';
import { Icons } from '~/components/icons';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Separator } from '~/components/ui/separator';
import { localizeError } from '~/i18n/errors';
import { getFixedT } from '~/i18n/locale.server';
import { mergeTranslationsWithStatus, type TranslationStatus } from '~/services/glossary.merge';
import {
  CHUNK_SIZE,
  chunkGroupsToRows,
  GlossaryParseError,
  groupRows,
  parseGlossaryFile,
  type GlossaryImportRow,
  type GroupedTerm,
} from '~/services/glossary.parse';
import { getGlossariesByGivenGlossaries, importGlossaries, readGlossariesByIds } from '~/services/glossary.service';

// ─── Types ────────────────────────────────────────────────────────────────────

// Subset of ReadGlossary we need for display — avoids Date→string mismatch from Remix JSON serialization.
type ExistingGlossary = {
  id: string;
  glossary: string;
  phonetic?: string | null;
  author?: string | null;
  cbetaFrequency?: string | null;
  discussion?: string | null;
  translations?:
    | Array<{
        glossary: string;
        language: string;
        sutraName: string;
        volume: string;
        originSutraText?: string | null;
        targetSutraText?: string | null;
        author?: string | null;
      }>
    | null
    | undefined;
};

type GlossaryGroup = GroupedTerm & {
  existing: ExistingGlossary | null;
};

type ActionResponse =
  | { intent: 'fetch-existing'; existing: Record<string, ExistingGlossary> }
  | { intent: 'import-chunk'; created: number; updated: number; failed: number }
  | { intent: 'error'; message: string };

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');
  // Import only adds entries or merges into them, so Maintain is the gate.
  if (defineAbilityFor(user).cannot('Maintain', 'GlossaryData')) throw redirect('/data/glossary');

  return json({ userId: user.id });
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');
  const t = await getFixedT(request);
  // Covers both intents — fetch-existing reads glossary rows, import-chunk writes them.
  if (defineAbilityFor(user).cannot('Maintain', 'GlossaryData')) {
    return json<ActionResponse>({ intent: 'error', message: t('glossary:errors.notAllowed') }, { status: 403 });
  }

  const formData = await request.formData();
  const intent = formData.get('intent') as string;

  // ── Fetch existing DB entries for a single chunk (bounded payload) ──
  if (intent === 'fetch-existing') {
    const uuids: string[] = JSON.parse((formData.get('uuids') as string) || '[]');
    const terms: string[] = JSON.parse((formData.get('terms') as string) || '[]');

    const [byUuid, byTerm] = await Promise.all([
      uuids.length ? readGlossariesByIds(uuids) : Promise.resolve([]),
      terms.length ? getGlossariesByGivenGlossaries(terms) : Promise.resolve([]),
    ]);

    const existing: Record<string, ExistingGlossary> = {};
    for (const g of byUuid) existing[g.id] = g;
    for (const g of byTerm) existing[g.glossary] = g;

    return json<ActionResponse>({ intent: 'fetch-existing', existing });
  }

  // ── Import chunk: write a batch of rows to the database ──
  if (intent === 'import-chunk') {
    const rowsJson = formData.get('rows') as string;

    if (!rowsJson) {
      return json<ActionResponse>({ intent: 'error', message: t('glossary:errors.noRows') }, { status: 400 });
    }

    try {
      const rows: GlossaryImportRow[] = JSON.parse(rowsJson);
      const result = await importGlossaries(rows, user.id);
      return json<ActionResponse>({ intent: 'import-chunk', ...result });
    } catch (e) {
      const message = e instanceof Error ? localizeError(e, t) : t('glossary:errors.importFailed');
      return json<ActionResponse>({ intent: 'error', message }, { status: 500 });
    }
  }

  return json<ActionResponse>({ intent: 'error', message: t('glossary:errors.unknownAction') }, { status: 400 });
}

// ─── GlossaryTermCard ─────────────────────────────────────────────────────────

type TermCardProps = {
  group: GlossaryGroup;
  variant: 'existing' | 'incoming';
};

const TRANSLATION_STATUS_LABELS = {
  kept: 'import.statusKept',
  new: 'import.statusNew',
} as const satisfies Record<TranslationStatus, string>;

const TRANSLATION_STATUS_STYLES: Record<TranslationStatus, string> = {
  kept: 'bg-muted text-muted-foreground',
  new: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200',
};

function GlossaryTermCard({ group, variant }: TermCardProps) {
  const isIncoming = variant === 'incoming';
  const isNew = !group.existing;
  const first = group.rows[0];
  const { t } = useTranslation('glossary');

  if (!isIncoming && !group.existing) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
        {t('import.noExistingEntry')}
      </div>
    );
  }

  const chineseTerm = isIncoming ? first.chineseTerm : group.existing!.glossary;
  const phonetic = isIncoming ? first.phonetic : group.existing!.phonetic;
  const author = isIncoming ? first.author : group.existing!.author;
  const cbetaFrequency = isIncoming ? first.cbetaFrequency : group.existing!.cbetaFrequency;

  const stored = (group.existing?.translations ?? []).map((t) => ({
    glossary: t.glossary,
    sutraName: t.sutraName,
    volume: t.volume,
    originSutraText: t.originSutraText ?? null,
    targetSutraText: t.targetSutraText ?? null,
    author: t.author ?? null,
  }));

  // Mirrors the server's merge in importGlossaries, so the panel shows the row that will
  // actually be stored — kept translations included, not just the file's rows.
  const translations: Array<(typeof stored)[number] & { status?: TranslationStatus }> = isIncoming
    ? mergeTranslationsWithStatus(
        stored,
        group.rows
          .filter((r) => r.englishTerm)
          .map((r) => ({
            glossary: r.englishTerm,
            sutraName: r.sutraName,
            volume: r.volume,
            originSutraText: r.chineseSutraText || null,
            targetSutraText: r.englishSutraText || null,
            author: r.author || null,
          })),
      ).map((m) => ({ ...m.translation, status: m.status }))
    : stored;

  return (
    <div
      className={`text-foreground space-y-2 rounded-lg border p-3 text-sm ${
        isIncoming && isNew
          ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30'
          : isIncoming
            ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
            : 'bg-muted/30'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-base leading-tight font-semibold">{chineseTerm}</span>
        {isIncoming && (
          <Badge className="shrink-0 text-xs" variant={isNew ? 'default' : 'secondary'}>
            {t(isNew ? 'import.newBadge' : 'import.updateBadge')}
          </Badge>
        )}
      </div>

      {(phonetic || author || cbetaFrequency) && (
        <div className="text-muted-foreground space-y-0.5 text-xs">
          {phonetic && <p>{phonetic}</p>}
          {author && <p>{t('chunked.author', { author })}</p>}
          {cbetaFrequency && <p>{t('chunked.cbeta', { frequency: cbetaFrequency })}</p>}
        </div>
      )}

      {translations.length > 0 ? (
        <div className="space-y-1.5 pt-0.5">
          {translations.map((tr, i) => (
            <div key={i} className="bg-background text-foreground space-y-0.5 rounded border p-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{tr.glossary}</p>
                {tr.status && (
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${TRANSLATION_STATUS_STYLES[tr.status]}`}>
                    {t(TRANSLATION_STATUS_LABELS[tr.status])}
                  </span>
                )}
              </div>
              {(tr.sutraName || tr.volume) && (
                <p className="text-muted-foreground">{[tr.sutraName, tr.volume].filter(Boolean).join(' · ')}</p>
              )}
              {tr.originSutraText && (
                <p className="text-muted-foreground line-clamp-2 italic">&ldquo;{tr.originSutraText}&rdquo;</p>
              )}
              {tr.targetSutraText && (
                <p className="text-muted-foreground line-clamp-2 italic">&ldquo;{tr.targetSutraText}&rdquo;</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs italic">{t('chunked.noTranslations')}</p>
      )}
    </div>
  );
}

// ─── ImportInstructions ───────────────────────────────────────────────────────

const richText = { strong: <strong />, em: <em />, code: <code /> };

function ImportInstructions() {
  const { t } = useTranslation('glossary');
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-primary flex items-center gap-2 text-lg">
          <FileText className="h-4 w-4" />
          {t('import.instructions.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground space-y-4 text-sm">
        <div>
          <GlossaryFileColumns variant="import" />
          <p className="mt-2">{t('import.instructions.mergedRows')}</p>
        </div>

        <Separator />

        <div>
          <p className="text-foreground mb-1 font-medium">{t('import.instructions.processHeading')}</p>
          <ol className="ml-4 list-decimal space-y-1">
            <li>
              <Trans t={t} components={richText} i18nKey="chunked.stepUpload" />
            </li>
            <li>
              <Trans
                t={t}
                components={richText}
                values={{ chunkSize: CHUNK_SIZE }}
                i18nKey="import.instructions.stepChunks"
              />
            </li>
            <li>
              <Trans t={t} components={richText} i18nKey="import.instructions.stepReview" />
            </li>
            <li>
              <Trans t={t} components={richText} i18nKey="import.instructions.stepImport" />
            </li>
            <li>
              <Trans
                t={t}
                components={richText}
                i18nKey="chunked.stepRepeat"
                values={{ done: t('import.instructions.repeatDone') }}
              />
            </li>
          </ol>
        </div>

        <Separator />

        <div>
          <p className="text-foreground mb-1 font-medium">{t('import.instructions.conflictHeading')}</p>
          <p>{t('import.instructions.conflictMatching')}</p>
          <p className="mt-2">
            <Trans t={t} components={richText} i18nKey="import.instructions.conflictMerge" />
          </p>
          <p className="mt-2">{t('import.instructions.conflictMetadata')}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

type ChunkResult = { created: number; updated: number; failed: number };

export default function GlossaryImportPage() {
  const actionData = useActionData<ActionResponse>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';
  const navigationIntent = navigation.formData?.get('intent') as string | null;

  // Per-chunk DB lookups — keeps payloads bounded to CHUNK_SIZE entries.
  const existingFetcher = useFetcher<ActionResponse>();

  const autoFetcher = useFetcher<ActionResponse>();
  const autoQueueRef = useRef<GlossaryImportRow[][]>([]);
  const lastAutoDataRef = useRef<typeof autoFetcher.data>(undefined);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // groups holds parsed-and-grouped data without DB entries (avoids large server payloads).
  const [groups, setGroups] = useState<GroupedTerm[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  // Existing DB entries for the currently displayed chunk only.
  const [chunkExisting, setChunkExisting] = useState<Record<string, ExistingGlossary>>({});

  const [chunkIndex, setChunkIndex] = useState(0);
  const [chunkResults, setChunkResults] = useState<ChunkResult[]>([]);
  const [isFullyImported, setIsFullyImported] = useState(false);
  const [isAutoImporting, setIsAutoImporting] = useState(false);
  const { t } = useTranslation(['glossary', 'common']);

  const totalGroups = groups.length;
  const totalCsvRows = totalRows;
  const totalChunks = Math.ceil(totalGroups / CHUNK_SIZE);

  const currentChunkGroups = groups.slice(chunkIndex * CHUNK_SIZE, (chunkIndex + 1) * CHUNK_SIZE);
  // Merge grouped terms with per-chunk DB data for the comparison panel.
  const currentChunk: GlossaryGroup[] = currentChunkGroups.map((g) => {
    // Mirrors the server's match order in importGlossaries: id first, then term.
    const existing = (g.uuid ? chunkExisting[g.uuid] : null) ?? chunkExisting[g.key] ?? null;
    return { ...g, existing };
  });
  const currentChunkRows = currentChunkGroups.flatMap((g) => g.rows);
  const remainingRows = groups.slice(chunkIndex * CHUNK_SIZE).flatMap((g) => g.rows);
  const isAllDone = isFullyImported || (totalChunks > 0 && chunkIndex >= totalChunks);
  const isLoadingExisting = existingFetcher.state !== 'idle';

  const totals = chunkResults.reduce(
    (acc, r) => ({ created: acc.created + r.created, updated: acc.updated + r.updated, failed: acc.failed + r.failed }),
    { created: 0, updated: 0, failed: 0 },
  );

  const resetState = () => {
    setGroups([]);
    setTotalRows(0);
    setChunkExisting({});
    setChunkIndex(0);
    setChunkResults([]);
    setIsFullyImported(false);
    setIsAutoImporting(false);
    setParseError(null);
    autoQueueRef.current = [];
    lastAutoDataRef.current = undefined;
  };

  // ── Both CSV and XLSX are parsed client-side — no file upload ──
  const handlePreview = async () => {
    if (!selectedFile) return;
    resetState();

    setIsParsing(true);
    try {
      const rows = await parseGlossaryFile(selectedFile);
      setGroups(groupRows(rows));
      setTotalRows(rows.length);
    } catch (e) {
      setParseError(e instanceof GlossaryParseError ? localizeError(e, t) : t('errors.parseFailed'));
    } finally {
      setIsParsing(false);
    }
  };

  // ── Fetch DB entries for the current chunk whenever groups or chunkIndex changes ──
  const existingFetcherSubmit = existingFetcher.submit;
  useEffect(() => {
    if (groups.length === 0 || isAutoImporting) return;
    const chunk = groups.slice(chunkIndex * CHUNK_SIZE, (chunkIndex + 1) * CHUNK_SIZE);
    if (chunk.length === 0) return;

    // Every group has a term; only some carry a UUID. Look both up — a group's id may be
    // unknown to the database while its term already exists.
    const uuids = chunk.map((g) => g.uuid).filter(Boolean);
    const terms = chunk.map((g) => g.key);

    existingFetcherSubmit(
      { intent: 'fetch-existing', uuids: JSON.stringify(uuids), terms: JSON.stringify(terms) },
      { method: 'post' },
    );
  }, [groups, chunkIndex, isAutoImporting, existingFetcherSubmit]);

  // ── Update chunkExisting when fetch-existing returns ──
  useEffect(() => {
    if (existingFetcher.data?.intent === 'fetch-existing') {
      setChunkExisting(existingFetcher.data.existing);
    }
  }, [existingFetcher.data]);

  // ── Manual chunk-by-chunk imports ──
  useEffect(() => {
    if (actionData?.intent === 'import-chunk') {
      setChunkResults((prev) => [
        ...prev,
        { created: actionData.created, updated: actionData.updated, failed: actionData.failed },
      ]);
      setChunkIndex((prev) => prev + 1);
    }
  }, [actionData]);

  const handleCancelAutoImport = () => {
    autoQueueRef.current = [];
    setIsAutoImporting(false);
  };

  // ── Auto-import: submit one chunk at a time via fetcher ──
  const handleImportAll = () => {
    const queue = chunkGroupsToRows(groups.slice(chunkIndex * CHUNK_SIZE));
    if (queue.length === 0) return;

    autoQueueRef.current = queue;
    lastAutoDataRef.current = autoFetcher.data;
    setIsAutoImporting(true);

    const formData = new FormData();
    formData.set('intent', 'import-chunk');
    formData.set('rows', JSON.stringify(queue[0]));
    autoFetcher.submit(formData, { method: 'post' });
  };

  useEffect(() => {
    if (!isAutoImporting) return;
    if (autoFetcher.state !== 'idle') return;
    if (!autoFetcher.data || autoFetcher.data === lastAutoDataRef.current) return;
    if (autoFetcher.data.intent !== 'import-chunk') return;

    lastAutoDataRef.current = autoFetcher.data;
    const { created, updated, failed } = autoFetcher.data;

    setChunkResults((prev) => [...prev, { created, updated, failed }]);
    setChunkIndex((prev) => prev + 1);

    const nextQueue = autoQueueRef.current.slice(1);
    autoQueueRef.current = nextQueue;

    if (nextQueue.length === 0) {
      setIsAutoImporting(false);
      setIsFullyImported(true);
    } else {
      const formData = new FormData();
      formData.set('intent', 'import-chunk');
      formData.set('rows', JSON.stringify(nextQueue[0]));
      autoFetcher.submit(formData, { method: 'post' });
    }
  }, [isAutoImporting, autoFetcher.state, autoFetcher.data, autoFetcher]);

  const errorMessage = parseError || (actionData?.intent === 'error' ? actionData.message : null);

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-6">
      {/* ── File upload ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-primary text-2xl">{t('import.title')}</CardTitle>
          <CardDescription className="text-base">{t('import.description', { chunkSize: CHUNK_SIZE })}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <label
              htmlFor="glossary-import-file"
              className="hover:bg-accent text-foreground flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium"
            >
              <Icons.Add className="h-4 w-4" />
              {fileName || t('chunked.chooseFile')}
            </label>
            <input
              type="file"
              name="file"
              className="sr-only"
              accept=".csv,.xlsx,.xls"
              id="glossary-import-file"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setSelectedFile(file);
                setFileName(file?.name ?? '');
                resetState();
              }}
            />
            <Button onClick={handlePreview} disabled={isParsing || !fileName}>
              {isParsing ? (
                <>
                  <Icons.Loader className="mr-2 h-4 w-4 animate-spin" />
                  {t('chunked.parsing')}
                </>
              ) : (
                t('chunked.preview')
              )}
            </Button>
          </div>

          {errorMessage && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* ── Progress + Import All ── */}
      {totalGroups > 0 && (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-foreground font-medium">
              {isAllDone ? t('import.complete') : t('chunked.chunkOf', { index: chunkIndex + 1, total: totalChunks })}
            </span>
            <span className="text-muted-foreground">
              {t('chunked.termCount', { count: totalGroups })} &middot;{' '}
              {t('chunked.csvRowCount', { count: totalCsvRows })}
            </span>
          </div>
          <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
            <div
              className="bg-primary h-full transition-all duration-300"
              style={{ width: `${Math.min((chunkIndex / totalChunks) * 100, 100)}%` }}
            />
          </div>
          {!isAllDone && (
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-xs">
                {t('chunked.remaining', {
                  rows: t('chunked.rowCount', { count: remainingRows.length }),
                  chunks: t('chunked.chunkCount', { count: totalChunks - chunkIndex }),
                })}
              </p>
              {isAutoImporting ? (
                <Button size="sm" variant="outline" onClick={handleCancelAutoImport}>
                  {t('common:actions.cancel')}
                </Button>
              ) : (
                <Button size="sm" variant="secondary" disabled={isSubmitting} onClick={handleImportAll}>
                  {t('chunked.importAll')}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Stats card (shown once any imports have run) ── */}
      {isAllDone && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-primary flex items-center gap-2 text-lg">
              <CheckCircle2 className="h-5 w-5" />
              {t('import.completeTitle')}
            </CardTitle>
            <CardDescription>
              {t('import.completeSummary', {
                terms: t('chunked.termCount', { count: totalGroups }),
                rows: t('chunked.csvRowCount', { count: totalCsvRows }),
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="rounded-lg border p-4">
                <p className="text-3xl font-bold text-green-600 dark:text-green-400">{totals.created}</p>
                <p className="text-foreground mt-1 text-sm font-medium">{t('chunked.created')}</p>
                <p className="text-muted-foreground text-xs">{t('chunked.createdHint')}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{totals.updated}</p>
                <p className="text-foreground mt-1 text-sm font-medium">{t('chunked.updated')}</p>
                <p className="text-muted-foreground text-xs">{t('import.updatedHint')}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-destructive text-3xl font-bold">{totals.failed}</p>
                <p className="text-foreground mt-1 text-sm font-medium">{t('chunked.failed')}</p>
                <p className="text-muted-foreground text-xs">{t('chunked.failedHint')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isAllDone && <InspectAfterImportCard />}

      {/* ── Comparison panel ── */}
      {totalGroups > 0 && !isAllDone && currentChunk.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-primary flex items-center gap-2 text-xl">
              <ArrowLeftRight className="h-5 w-5" />
              {t('chunked.chunkOf', { index: chunkIndex + 1, total: totalChunks })}
            </CardTitle>
            <CardDescription className="text-base">
              {t('import.reviewing', {
                terms: t('chunked.termCount', { count: currentChunk.length }),
                rows: t('chunked.csvRowCount', { count: currentChunkRows.length }),
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoadingExisting ? (
              <div className="text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm">
                <Icons.Loader className="h-4 w-4 animate-spin" />
                {t('import.loadingComparison')}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {/* Left: current database state */}
                <div>
                  <h4 className="text-primary mb-3 text-base font-medium">{t('import.currentDatabase')}</h4>
                  <div className="space-y-2">
                    {currentChunk.map((group) => (
                      <GlossaryTermCard group={group} key={group.key} variant="existing" />
                    ))}
                  </div>
                </div>

                {/* Right: incoming from file */}
                <div>
                  <h4 className="text-primary mb-3 text-base font-medium">
                    {t('import.incoming')}{' '}
                    <span className="text-muted-foreground text-sm font-normal">
                      {t('import.incomingCounts', {
                        new: currentChunk.filter((g) => !g.existing).length,
                        updates: currentChunk.filter((g) => g.existing).length,
                      })}
                    </span>
                  </h4>
                  <div className="space-y-2">
                    {currentChunk.map((group) => (
                      <GlossaryTermCard group={group} key={group.key} variant="incoming" />
                    ))}
                  </div>
                </div>
              </div>
            )}

            <Separator />

            <div className="flex items-center justify-end gap-3">
              {isAutoImporting ? (
                <Button variant="outline" onClick={handleCancelAutoImport}>
                  {t('common:actions.cancel')}
                </Button>
              ) : (
                <Button variant="secondary" disabled={isSubmitting} onClick={handleImportAll}>
                  {t('chunked.importAll')}
                </Button>
              )}
              <Form method="post">
                <input type="hidden" name="intent" value="import-chunk" />
                <input name="rows" type="hidden" value={JSON.stringify(currentChunkRows)} />
                <Button type="submit" disabled={isSubmitting} className="flex items-center gap-2">
                  {isSubmitting && navigationIntent === 'import-chunk' ? (
                    <>
                      <Icons.Loader className="h-4 w-4 animate-spin" />
                      {t('chunked.importing')}
                    </>
                  ) : (
                    <>
                      {t('chunked.importChunk')}
                      <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </Form>
            </div>
          </CardContent>
        </Card>
      )}

      <ImportInstructions />
    </div>
  );
}

// ── After an import ──────────────────────────────────────────────────────────
//
// An import is when index records go wrong, and it is the moment an admin still knows what
// they just did — but the state worth looking at is the glossary as a whole, not only the
// entries this file touched. The inspector is where that lives.
function InspectAfterImportCard() {
  const { t } = useTranslation('glossary');
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-primary text-lg">{t('import.inspectTitle')}</CardTitle>
        <CardDescription>{t('import.inspectDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild size="sm" variant="secondary">
          <Link to="/data/glossary/inspector">{t('import.openInspector')}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
