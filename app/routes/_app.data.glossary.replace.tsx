import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';

import { json, redirect } from '@remix-run/node';
import { Form, useActionData, useFetcher, useNavigation } from '@remix-run/react';
import { AlertCircle, CheckCircle2, ChevronRight, FileText } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { assertAuthUser } from '~/auth.server';
import { defineAbilityFor } from '~/authorisation';
import { Icons } from '~/components/icons';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Separator } from '~/components/ui/separator';
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
  // Replacing the glossary is admin-only. The index page hides the link, but that's cosmetic —
  // this check and the one in the action are what actually hold.
  if (defineAbilityFor(user).cannot('Delete', 'Glossary')) throw redirect('/data/glossary');

  return json({ userId: user.id });
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');
  // The gate that matters: a non-admin POSTing here directly must not reach deleteAllGlossaries.
  if (defineAbilityFor(user).cannot('Delete', 'Glossary')) {
    return json<ActionResponse>({ intent: 'error', message: 'Not allowed.' }, { status: 403 });
  }

  const formData = await request.formData();
  const intent = formData.get('intent') as string;

  // ── Import chunk: write a batch of rows, wiping the table first on the opening chunk ──
  if (intent === 'import-chunk') {
    const rowsJson = formData.get('rows') as string;
    const wipe = formData.get('wipe') === 'true';

    if (!rowsJson) {
      return json<ActionResponse>({ intent: 'error', message: 'No rows provided.' }, { status: 400 });
    }

    try {
      const rows: GlossaryImportRow[] = JSON.parse(rowsJson);
      if (wipe) {
        await deleteAllGlossaries();
      }
      const result = await importGlossaries(rows, user.id);
      return json<ActionResponse>({ intent: 'import-chunk', ...result });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Import failed.';
      return json<ActionResponse>({ intent: 'error', message }, { status: 500 });
    }
  }

  return json<ActionResponse>({ intent: 'error', message: 'Unknown action.' }, { status: 400 });
}

// ─── GlossaryTermCard ─────────────────────────────────────────────────────────

// There's no comparison panel here — the table is emptied first, so the only thing
// worth showing is what the file is about to write.
function GlossaryTermCard({ group }: { group: GroupedTerm }) {
  const first = group.rows[0];
  const { chineseTerm, phonetic, author, cbetaFrequency } = first;

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
          {author && <p>Author: {author}</p>}
          {cbetaFrequency && <p>CBETA: {cbetaFrequency}</p>}
        </div>
      )}

      {translations.length > 0 ? (
        <div className="space-y-1.5 pt-0.5">
          {translations.map((t, i) => (
            <div key={i} className="bg-background text-foreground space-y-0.5 rounded border p-2 text-xs">
              <p className="font-medium">{t.glossary}</p>
              {(t.sutraName || t.volume) && (
                <p className="text-muted-foreground">{[t.sutraName, t.volume].filter(Boolean).join(' · ')}</p>
              )}
              {t.originSutraText && (
                <p className="text-muted-foreground line-clamp-2 italic">&ldquo;{t.originSutraText}&rdquo;</p>
              )}
              {t.targetSutraText && (
                <p className="text-muted-foreground line-clamp-2 italic">&ldquo;{t.targetSutraText}&rdquo;</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs italic">No translations</p>
      )}
    </div>
  );
}

// ─── ReplaceInstructions ──────────────────────────────────────────────────────

function ReplaceInstructions() {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-primary flex items-center gap-2 text-lg">
          <FileText className="h-4 w-4" />
          File Format &amp; Replace Instructions
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground space-y-4 text-sm">
        <div>
          <p className="text-foreground mb-1 font-medium">CSV / XLSX columns (header row required)</p>
          <ul className="ml-4 list-disc space-y-0.5">
            <li>
              <code>UUID</code> — optional; groups rows into one entry and preserves the entry&apos;s ID
            </li>
            <li>
              <code>ChineseTerm</code> — <strong>required</strong>; the primary glossary entry
            </li>
            <li>
              <code>EnglishTerm</code> — English translation; rows without this field contribute metadata only
            </li>
            <li>
              <code>Phonetic</code> — pronunciation guide (applies to the whole entry)
            </li>
            <li>
              <code>Author</code> — translation author (applies to the whole entry)
            </li>
            <li>
              <code>CBetaFrequency</code> — frequency in the CBETA corpus
            </li>
            <li>
              <code>SutraName</code> — source sutra for this translation
            </li>
            <li>
              <code>Volume</code> — volume within the source sutra
            </li>
            <li>
              <code>ChineseSutraText</code> — Chinese context sentence for the translation
            </li>
            <li>
              <code>EnglishSutraText</code> — English context sentence for the translation
            </li>
          </ul>
          <p className="mt-2">
            Multiple rows sharing the same UUID or Chinese term are merged into one glossary entry with multiple
            translations.
          </p>
        </div>

        <Separator />

        <div>
          <p className="text-foreground mb-1 font-medium">Chunked replace process</p>
          <ol className="ml-4 list-decimal space-y-1">
            <li>
              <strong>Upload</strong> — select your CSV or XLSX file and click <em>Preview</em>. Both file types are
              parsed locally in your browser — no file data is sent to the server, so large files are handled without
              hitting upload size limits.
            </li>
            <li>
              <strong>Chunk display</strong> — the file is divided into chunks of{' '}
              <strong>{CHUNK_SIZE} glossary terms</strong> (not rows). Each term may span several rows when it has
              multiple translations.
            </li>
            <li>
              <strong>Review</strong> — each chunk lists the entries it will write. There is no side-by-side comparison,
              because the existing glossary is discarded rather than merged.
            </li>
            <li>
              <strong>Import Chunk</strong> — writes the current chunk and advances. The first write deletes every
              existing glossary entry before inserting.
            </li>
            <li>
              <strong>Repeat</strong> until all chunks are written. The progress bar at the top tracks how far along you
              are.
            </li>
          </ol>
        </div>

        <Separator />

        <div>
          <p className="text-foreground mb-1 font-medium">Replacing existing data</p>
          <p>
            Starting the import <strong>permanently deletes every existing glossary entry</strong>, then writes the
            file&apos;s entries as new records. There is no per-row matching or merging against current data — the file
            becomes the complete glossary. New entries are indexed in Algolia automatically.
          </p>
          <p className="mt-2">
            The wipe happens as part of the first chunk&apos;s write, and the remaining chunks are separate requests. If
            you stop partway the glossary will contain only the chunks written so far, so{' '}
            <strong>download a CSV backup before you start</strong>.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

type ChunkResult = { created: number; updated: number; failed: number };

const WIPE_CONFIRM = 'This permanently deletes all existing glossary entries before importing. Continue?';

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
      setParseError(e instanceof GlossaryParseError ? e.message : 'Failed to parse file.');
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
    if (isFirstChunk && !window.confirm(WIPE_CONFIRM)) return;

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
          <CardTitle className="text-primary text-2xl">Replace Glossary</CardTitle>
          <CardDescription className="text-base">
            Upload a CSV or XLSX file to replace the entire glossary. The first write clears all existing entries, then
            the file is imported in chunks of {CHUNK_SIZE} terms at a time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Starting the import permanently deletes every existing glossary entry before writing the file. This cannot
              be undone — download a CSV backup first.
            </AlertDescription>
          </Alert>

          <div className="flex items-center gap-3">
            <label
              htmlFor="glossary-replace-file"
              className="hover:bg-accent text-foreground flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium"
            >
              <Icons.Add className="h-4 w-4" />
              {fileName || 'Choose CSV or XLSX file'}
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
                  Parsing…
                </>
              ) : (
                'Preview'
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
            {uuidConflicts.length} {uuidConflicts.length === 1 ? 'term carries' : 'terms carry'} more than one UUID in
            this file (
            {uuidConflicts
              .slice(0, 5)
              .map((g) => g.key)
              .join('、')}
            {uuidConflicts.length > 5 ? '…' : ''}). Each term can only be one entry, so the first UUID is kept and the
            others are discarded. Fix the file if those ids matter.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Progress + Import All ── */}
      {totalGroups > 0 && (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-foreground font-medium">
              {isAllDone ? 'Replace complete' : `Chunk ${chunkIndex + 1} of ${totalChunks}`}
            </span>
            <span className="text-muted-foreground">
              {totalGroups} terms &middot; {totalRows} rows
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
                {remainingRows.length} rows remaining across {totalChunks - chunkIndex}{' '}
                {totalChunks - chunkIndex === 1 ? 'chunk' : 'chunks'}
              </p>
              {isAutoImporting ? (
                <Button size="sm" variant="outline" onClick={handleCancelAutoImport}>
                  Cancel
                </Button>
              ) : (
                <Button size="sm" variant="secondary" disabled={isSubmitting} onClick={handleImportAll}>
                  Import All
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
              Replace Complete
            </CardTitle>
            <CardDescription>
              {totalGroups} terms from file &middot; {totalRows} rows written
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="rounded-lg border p-4">
                <p className="text-3xl font-bold text-green-600 dark:text-green-400">{totals.created}</p>
                <p className="text-foreground mt-1 text-sm font-medium">Created</p>
                <p className="text-muted-foreground text-xs">new entries added</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{totals.updated}</p>
                <p className="text-foreground mt-1 text-sm font-medium">Updated</p>
                <p className="text-muted-foreground text-xs">already existed — expected 0</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-destructive text-3xl font-bold">{totals.failed}</p>
                <p className="text-foreground mt-1 text-sm font-medium">Failed</p>
                <p className="text-muted-foreground text-xs">entries not imported</p>
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
              Chunk {chunkIndex + 1} of {totalChunks}
            </CardTitle>
            <CardDescription className="text-base">
              Writing {currentChunkGroups.length} {currentChunkGroups.length === 1 ? 'term' : 'terms'} (
              {currentChunkRows.length} {currentChunkRows.length === 1 ? 'row' : 'rows'}). Upload a new file above to
              start over.
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
                  Cancel
                </Button>
              ) : (
                <Button variant="secondary" disabled={isSubmitting} onClick={handleImportAll}>
                  Import All
                </Button>
              )}
              <Form
                method="post"
                onSubmit={(e) => {
                  if (isFirstChunk && !window.confirm(WIPE_CONFIRM)) e.preventDefault();
                }}
              >
                <input type="hidden" name="intent" value="import-chunk" />
                <input name="wipe" type="hidden" value={isFirstChunk ? 'true' : 'false'} />
                <input name="rows" type="hidden" value={JSON.stringify(currentChunkRows)} />
                <Button type="submit" disabled={isSubmitting} className="flex items-center gap-2">
                  {isSubmitting && navigationIntent === 'import-chunk' ? (
                    <>
                      <Icons.Loader className="h-4 w-4 animate-spin" />
                      Importing…
                    </>
                  ) : (
                    <>
                      Import Chunk
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
