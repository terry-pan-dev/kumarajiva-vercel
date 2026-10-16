import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';

import { json, redirect } from '@remix-run/node';
import { Form, useActionData, useFetcher, useNavigation } from '@remix-run/react';
import { AlertCircle, CheckCircle2, ChevronRight, FileText } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { assertAuthUser } from '~/auth.server';
import { defineAbilityFor } from '~/authorisation';
import { GlossaryFileColumns } from '~/components/data/GlossaryFileColumns';
import { Icons } from '~/components/icons';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Separator } from '~/components/ui/separator';
import { localizeError } from '~/i18n/errors';
import { getFixedT } from '~/i18n/locale.server';
import {
  CHUNK_SIZE,
  chunkGroupsToRows,
  GlossaryParseError,
  groupRows,
  parseGlossaryFile,
  type GlossaryImportRow,
  type GroupedTerm,
} from '~/services/glossary.parse';
import { deleteAllGlossaries, importGlossaries } from '~/services/glossary.service';

// ─── Types ────────────────────────────────────────────────────────────────────

type ActionResponse =
  | { intent: 'import-chunk'; created: number; updated: number; failed: number }
  | { intent: 'error'; message: string };

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');
  // Replacing the glossary cannot be undone, so it needs Administrate. The index page hides the link, but that's cosmetic —
  // this check and the one in the action are what actually hold.
  if (defineAbilityFor(user).cannot('Administrate', 'GlossaryData')) throw redirect('/data/glossary');

  return json({ userId: user.id });
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');
  const t = await getFixedT(request);
  // The gate that matters: a non-admin POSTing here directly must not reach deleteAllGlossaries.
  if (defineAbilityFor(user).cannot('Administrate', 'GlossaryData')) {
    return json<ActionResponse>({ intent: 'error', message: t('glossary:errors.notAllowed') }, { status: 403 });
  }

  const formData = await request.formData();
  const intent = formData.get('intent') as string;

  // ── Import chunk: write a batch of rows, wiping the table first on the opening chunk ──
  if (intent === 'import-chunk') {
    const rowsJson = formData.get('rows') as string;
    const wipe = formData.get('wipe') === 'true';

    if (!rowsJson) {
      return json<ActionResponse>({ intent: 'error', message: t('glossary:errors.noRows') }, { status: 400 });
    }

    try {
      const rows: GlossaryImportRow[] = JSON.parse(rowsJson);
      if (wipe) {
        await deleteAllGlossaries();
      }
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

// There's no comparison panel here — the table is emptied first, so the only thing
// worth showing is what the file is about to write.
function GlossaryTermCard({ group }: { group: GroupedTerm }) {
  const first = group.rows[0];
  const { chineseTerm, phonetic, author, cbetaFrequency } = first;
  const { t } = useTranslation('glossary');

  const translations = group.rows
    .filter((r) => r.englishTerm)
    .map((r) => ({
      glossary: r.englishTerm,
      sutraName: r.sutraName,
      volume: r.volume,
      originSutraText: r.chineseSutraText || null,
      targetSutraText: r.englishSutraText || null,
    }));

  return (
    <div className="text-foreground space-y-2 rounded-lg border p-3 text-sm">
      <span className="text-base leading-tight font-semibold">{chineseTerm}</span>

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
              <p className="font-medium">{tr.glossary}</p>
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

// ─── ReplaceInstructions ──────────────────────────────────────────────────────

const richText = { strong: <strong />, em: <em />, code: <code /> };

function ReplaceInstructions() {
  const { t } = useTranslation('glossary');
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-primary flex items-center gap-2 text-lg">
          <FileText className="h-4 w-4" />
          {t('replace.instructions.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground space-y-4 text-sm">
        <div>
          <GlossaryFileColumns variant="replace" />
          <p className="mt-2">{t('replace.instructions.mergedRows')}</p>
        </div>

        <Separator />

        <div>
          <p className="text-foreground mb-1 font-medium">{t('replace.instructions.processHeading')}</p>
          <ol className="ml-4 list-decimal space-y-1">
            <li>
              <Trans t={t} components={richText} i18nKey="chunked.stepUpload" />
            </li>
            <li>
              <Trans
                t={t}
                components={richText}
                values={{ chunkSize: CHUNK_SIZE }}
                i18nKey="replace.instructions.stepChunks"
              />
            </li>
            <li>
              <Trans t={t} components={richText} i18nKey="replace.instructions.stepReview" />
            </li>
            <li>
              <Trans t={t} components={richText} i18nKey="replace.instructions.stepImport" />
            </li>
            <li>
              <Trans
                t={t}
                components={richText}
                i18nKey="chunked.stepRepeat"
                values={{ done: t('replace.instructions.repeatDone') }}
              />
            </li>
          </ol>
        </div>

        <Separator />

        <div>
          <p className="text-foreground mb-1 font-medium">{t('replace.instructions.existingHeading')}</p>
          <p>
            <Trans t={t} components={richText} i18nKey="replace.instructions.existingWipe" />
          </p>
          <p className="mt-2">
            <Trans t={t} components={richText} i18nKey="replace.instructions.existingPartial" />
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

type ChunkResult = { created: number; updated: number; failed: number };

export default function GlossaryReplacePage() {
  const actionData = useActionData<ActionResponse>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';
  const navigationIntent = navigation.formData?.get('intent') as string | null;

  const autoFetcher = useFetcher<ActionResponse>();
  const autoQueueRef = useRef<GlossaryImportRow[][]>([]);
  const lastAutoDataRef = useRef<typeof autoFetcher.data>(undefined);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // groups holds parsed-and-grouped data (avoids large server payloads — only chunks are posted).
  const [groups, setGroups] = useState<GroupedTerm[]>([]);
  const [totalRows, setTotalRows] = useState(0);

  const [chunkIndex, setChunkIndex] = useState(0);
  const [chunkResults, setChunkResults] = useState<ChunkResult[]>([]);
  const [isFullyImported, setIsFullyImported] = useState(false);
  const [isAutoImporting, setIsAutoImporting] = useState(false);
  const { t } = useTranslation(['glossary', 'common']);
  const wipeConfirm = t('replace.confirmWipe');

  const totalGroups = groups.length;
  const totalChunks = Math.ceil(totalGroups / CHUNK_SIZE);

  // A term whose rows carry more than one UUID is ambiguous — groupRows keeps the first.
  const uuidConflicts = groups.filter((g) => g.uuidConflict);

  const currentChunkGroups = groups.slice(chunkIndex * CHUNK_SIZE, (chunkIndex + 1) * CHUNK_SIZE);
  const currentChunkRows = currentChunkGroups.flatMap((g) => g.rows);
  const remainingRows = groups.slice(chunkIndex * CHUNK_SIZE).flatMap((g) => g.rows);
  const isAllDone = isFullyImported || (totalChunks > 0 && chunkIndex >= totalChunks);

  // Only the opening write of a run wipes; every later chunk appends to it.
  const isFirstChunk = chunkIndex === 0 && chunkResults.length === 0;

  const totals = chunkResults.reduce(
    (acc, r) => ({ created: acc.created + r.created, updated: acc.updated + r.updated, failed: acc.failed + r.failed }),
    { created: 0, updated: 0, failed: 0 },
  );

  const resetState = () => {
    setGroups([]);
    setTotalRows(0);
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

  // ── Manual chunk-by-chunk imports (via <Form> + useActionData) ──
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
    if (isFirstChunk && !window.confirm(wipeConfirm)) return;

    const queue = chunkGroupsToRows(groups.slice(chunkIndex * CHUNK_SIZE));
    if (queue.length === 0) return;

    autoQueueRef.current = queue;
    lastAutoDataRef.current = autoFetcher.data;
    setIsAutoImporting(true);

    const formData = new FormData();
    formData.set('intent', 'import-chunk');
    formData.set('rows', JSON.stringify(queue[0]));
    formData.set('wipe', isFirstChunk ? 'true' : 'false');
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
      // The wipe already happened on the opening chunk — follow-ups only append.
      const formData = new FormData();
      formData.set('intent', 'import-chunk');
      formData.set('rows', JSON.stringify(nextQueue[0]));
      formData.set('wipe', 'false');
      autoFetcher.submit(formData, { method: 'post' });
    }
  }, [isAutoImporting, autoFetcher.state, autoFetcher.data, autoFetcher]);

  const errorMessage = parseError || (actionData?.intent === 'error' ? actionData.message : null);

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-6">
      {/* ── File upload ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-primary text-2xl">{t('replace.title')}</CardTitle>
          <CardDescription className="text-base">{t('replace.description', { chunkSize: CHUNK_SIZE })}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{t('replace.warning')}</AlertDescription>
          </Alert>

          <div className="flex items-center gap-3">
            <label
              htmlFor="glossary-replace-file"
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
              id="glossary-replace-file"
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

      {/* ── Ambiguous UUIDs in the uploaded file ── */}
      {uuidConflicts.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {t('replace.uuidConflicts', {
              count: uuidConflicts.length,
              terms:
                uuidConflicts
                  .slice(0, 5)
                  .map((g) => g.key)
                  .join('、') + (uuidConflicts.length > 5 ? '…' : ''),
            })}
          </AlertDescription>
        </Alert>
      )}

      {/* ── Progress + Import All ── */}
      {totalGroups > 0 && (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-foreground font-medium">
              {isAllDone ? t('replace.complete') : t('chunked.chunkOf', { index: chunkIndex + 1, total: totalChunks })}
            </span>
            <span className="text-muted-foreground">
              {t('chunked.termCount', { count: totalGroups })} &middot; {t('chunked.rowCount', { count: totalRows })}
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

      {/* ── Stats card (shown once the replace finishes) ── */}
      {isAllDone && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-primary flex items-center gap-2 text-lg">
              <CheckCircle2 className="h-5 w-5" />
              {t('replace.completeTitle')}
            </CardTitle>
            <CardDescription>
              {t('replace.completeSummary', {
                terms: t('chunked.termCount', { count: totalGroups }),
                rows: t('chunked.rowCount', { count: totalRows }),
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
                <p className="text-muted-foreground text-xs">{t('replace.updatedHint')}</p>
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

      {/* ── Incoming entries preview ── */}
      {totalGroups > 0 && !isAllDone && currentChunkGroups.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-primary flex items-center gap-2 text-xl">
              <FileText className="h-5 w-5" />
              {t('chunked.chunkOf', { index: chunkIndex + 1, total: totalChunks })}
            </CardTitle>
            <CardDescription className="text-base">
              {t('replace.writing', {
                terms: t('chunked.termCount', { count: currentChunkGroups.length }),
                rows: t('chunked.rowCount', { count: currentChunkRows.length }),
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              {currentChunkGroups.map((group) => (
                <GlossaryTermCard group={group} key={group.key} />
              ))}
            </div>

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
              <Form
                method="post"
                onSubmit={(e) => {
                  if (isFirstChunk && !window.confirm(wipeConfirm)) e.preventDefault();
                }}
              >
                <input type="hidden" name="intent" value="import-chunk" />
                <input name="wipe" type="hidden" value={isFirstChunk ? 'true' : 'false'} />
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

      <ReplaceInstructions />
    </div>
  );
}
