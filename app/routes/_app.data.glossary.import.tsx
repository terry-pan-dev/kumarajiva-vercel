import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';

import { json, redirect } from '@remix-run/node';
import { Form, useActionData, useFetcher, useNavigation } from '@remix-run/react';
import { AlertCircle, ArrowLeftRight, CheckCircle2, ChevronRight, FileText } from 'lucide-react';
import Papa from 'papaparse';
import { useEffect, useRef, useState } from 'react';

import { assertAuthUser } from '~/auth.server';
import { Icons } from '~/components/icons';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Separator } from '~/components/ui/separator';
import {
  getGlossariesByGivenGlossaries,
  importGlossaries,
  readGlossariesByIds,
  type GlossaryImportRow,
} from '~/services/glossary.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 15;

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

type GroupedTerm = {
  key: string;
  rows: GlossaryImportRow[];
};

type GlossaryGroup = GroupedTerm & {
  existing: ExistingGlossary | null;
};

type ActionResponse =
  | { intent: 'fetch-existing'; existing: Record<string, ExistingGlossary> }
  | { intent: 'import-chunk'; created: number; updated: number; failed: number }
  | { intent: 'error'; message: string };

// ─── Parsers (client-side) ────────────────────────────────────────────────────

// Maps lowercase header variants to canonical GlossaryImportRow field names.
const XLSX_COLUMNS: Record<string, keyof GlossaryImportRow> = {
  uuid: 'uuid',
  chineseterm: 'chineseTerm',
  'chinese term': 'chineseTerm',
  englishterm: 'englishTerm',
  'english term': 'englishTerm',
  chinesesutratext: 'chineseSutraText',
  'chinese sutra text': 'chineseSutraText',
  englishsutratext: 'englishSutraText',
  'english sutra text': 'englishSutraText',
  sutraname: 'sutraName',
  'sutra name': 'sutraName',
  volume: 'volume',
  cbetafrequency: 'cbetaFrequency',
  'cbeta frequency': 'cbetaFrequency',
  author: 'author',
  phonetic: 'phonetic',
};

// PapaParse is isomorphic — safe to call in browser event handlers.
function parseGlossaryCSV(csvText: string): GlossaryImportRow[] {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  return result.data
    .filter((row) => row.ChineseTerm?.trim())
    .map((row) => ({
      uuid: row.UUID?.trim() ?? '',
      chineseTerm: row.ChineseTerm?.trim() ?? '',
      englishTerm: row.EnglishTerm?.trim() ?? '',
      chineseSutraText: row.ChineseSutraText?.trim() ?? '',
      englishSutraText: row.EnglishSutraText?.trim() ?? '',
      sutraName: row.SutraName?.trim() ?? '',
      volume: row.Volume?.trim() ?? '',
      cbetaFrequency: row.CBetaFrequency?.trim() ?? '',
      author: row.Author?.trim() ?? '',
      phonetic: row.Phonetic?.trim() ?? '',
    }));
}

// SheetJS is dynamically imported so it's only bundled when the user actually clicks Preview on an XLSX.
async function parseGlossaryXLSX(file: File): Promise<GlossaryImportRow[]> {
  const { read, utils } = await import('xlsx');
  const arrayBuffer = await file.arrayBuffer();
  const workbook = read(new Uint8Array(arrayBuffer), { type: 'array' });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!worksheet) return [];

  // aoa[0] = header row; aoa[1..] = data rows.
  const aoa = utils.sheet_to_json<string[]>(worksheet, { header: 1, defval: '', raw: false });
  if (aoa.length === 0) return [];

  const colMap: Record<number, keyof GlossaryImportRow> = {};
  aoa[0].forEach((header, idx) => {
    const field =
      XLSX_COLUMNS[
        String(header ?? '')
          .trim()
          .toLowerCase()
      ];
    if (field) colMap[idx] = field;
  });

  return aoa
    .slice(1)
    .map((row) => {
      const entry: GlossaryImportRow = {
        uuid: '',
        chineseTerm: '',
        englishTerm: '',
        chineseSutraText: '',
        englishSutraText: '',
        sutraName: '',
        volume: '',
        cbetaFrequency: '',
        author: '',
        phonetic: '',
      };
      Object.entries(colMap).forEach(([idxStr, field]) => {
        entry[field] = String(row[Number(idxStr)] ?? '').trim();
      });
      return entry;
    })
    .filter((entry) => entry.chineseTerm);
}

// Groups CSV/XLSX rows by UUID (if present) or Chinese term. One group = one glossary entry.
function groupRows(rows: GlossaryImportRow[]): GroupedTerm[] {
  const byKey = new Map<string, GlossaryImportRow[]>();
  for (const row of rows) {
    const key = row.uuid || `term:${row.chineseTerm}`;
    const bucket = byKey.get(key) ?? [];
    bucket.push(row);
    byKey.set(key, bucket);
  }
  return [...byKey.entries()].map(([key, groupRows]) => ({ key, rows: groupRows }));
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');
  return json({ userId: user.id });
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');

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
      return json<ActionResponse>({ intent: 'error', message: 'No rows provided.' }, { status: 400 });
    }

    try {
      const rows: GlossaryImportRow[] = JSON.parse(rowsJson);
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

type TermCardProps = {
  group: GlossaryGroup;
  variant: 'existing' | 'incoming';
};

function GlossaryTermCard({ group, variant }: TermCardProps) {
  const isIncoming = variant === 'incoming';
  const isNew = !group.existing;
  const first = group.rows[0];

  if (!isIncoming && !group.existing) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
        No existing entry
      </div>
    );
  }

  const chineseTerm = isIncoming ? first.chineseTerm : group.existing!.glossary;
  const phonetic = isIncoming ? first.phonetic : group.existing!.phonetic;
  const author = isIncoming ? first.author : group.existing!.author;
  const cbetaFrequency = isIncoming ? first.cbetaFrequency : group.existing!.cbetaFrequency;

  const translations = isIncoming
    ? group.rows
        .filter((r) => r.englishTerm)
        .map((r) => ({
          glossary: r.englishTerm,
          sutraName: r.sutraName,
          volume: r.volume,
          originSutraText: r.chineseSutraText || null,
          targetSutraText: r.englishSutraText || null,
        }))
    : (group.existing?.translations ?? []).map((t) => ({
        glossary: t.glossary,
        sutraName: t.sutraName,
        volume: t.volume,
        originSutraText: t.originSutraText ?? null,
        targetSutraText: t.targetSutraText ?? null,
      }));

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
            {isNew ? 'New' : 'Update'}
          </Badge>
        )}
      </div>

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

// ─── ImportInstructions ───────────────────────────────────────────────────────

function ImportInstructions() {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-primary flex items-center gap-2 text-lg">
          <FileText className="h-4 w-4" />
          File Format &amp; Import Instructions
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground space-y-4 text-sm">
        <div>
          <p className="text-foreground mb-1 font-medium">CSV / XLSX columns (header row required)</p>
          <ul className="ml-4 list-disc space-y-0.5">
            <li>
              <code>UUID</code> — optional; links a row to an existing database entry (use the downloaded export to
              preserve IDs)
            </li>
            <li>
              <code>ChineseTerm</code> — <strong>required</strong>; the primary glossary entry
            </li>
            <li>
              <code>EnglishTerm</code> — English translation; rows without this field are used only for metadata updates
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
            Multiple CSV rows sharing the same UUID or Chinese term are merged into one glossary entry with multiple
            translations.
          </p>
        </div>

        <Separator />

        <div>
          <p className="text-foreground mb-1 font-medium">Chunked import process</p>
          <ol className="ml-4 list-decimal space-y-1">
            <li>
              <strong>Upload</strong> — select your CSV or XLSX file and click <em>Preview</em>. Both file types are
              parsed locally in your browser — no file data is sent to the server, so large files are handled without
              hitting upload size limits.
            </li>
            <li>
              <strong>Chunk display</strong> — the file is divided into chunks of{' '}
              <strong>{CHUNK_SIZE} glossary terms</strong> (not rows). Each term may span several CSV rows when it has
              multiple translations.
            </li>
            <li>
              <strong>Review</strong> — the left column shows what is currently in the database; the right column shows
              what the CSV will create or overwrite. Green cards are new entries; amber cards are updates.
            </li>
            <li>
              <strong>Import Chunk</strong> — click the button to write the current chunk to the database, then the next
              chunk is shown automatically.
            </li>
            <li>
              <strong>Repeat</strong> until all chunks are imported. The progress bar at the top tracks how far along
              you are.
            </li>
          </ol>
        </div>

        <Separator />

        <div>
          <p className="text-foreground mb-1 font-medium">Conflict resolution</p>
          <p>
            Rows with a UUID are matched to the existing record by primary key. Rows without a UUID are matched by
            Chinese term. When a match is found the entry&apos;s metadata (phonetic, author, CBETA frequency) and its
            full translations list are <strong>replaced</strong> with the CSV values. New entries are created and
            indexed in Algolia automatically.
          </p>
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

  const totalGroups = groups.length;
  const totalCsvRows = totalRows;
  const totalChunks = Math.ceil(totalGroups / CHUNK_SIZE);

  const currentChunkGroups = groups.slice(chunkIndex * CHUNK_SIZE, (chunkIndex + 1) * CHUNK_SIZE);
  // Merge grouped terms with per-chunk DB data for the comparison panel.
  const currentChunk: GlossaryGroup[] = currentChunkGroups.map((g) => {
    const first = g.rows[0];
    const existing = first.uuid ? (chunkExisting[first.uuid] ?? null) : (chunkExisting[first.chineseTerm] ?? null);
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

    const lowerName = selectedFile.name.toLowerCase();
    setIsParsing(true);
    try {
      let rows: GlossaryImportRow[];
      if (lowerName.endsWith('.csv')) {
        rows = parseGlossaryCSV(await selectedFile.text());
      } else if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
        rows = await parseGlossaryXLSX(selectedFile);
      } else {
        setParseError('Invalid file type. Please upload a CSV or XLSX file.');
        return;
      }

      if (rows.length === 0) {
        setParseError('No valid rows found. Ensure the file has a ChineseTerm column.');
        return;
      }

      const grouped = groupRows(rows);
      setGroups(grouped);
      setTotalRows(rows.length);
    } catch {
      setParseError('Failed to parse file.');
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

    const uuids = chunk.filter((g) => g.rows[0].uuid).map((g) => g.rows[0].uuid);
    const terms = chunk.filter((g) => !g.rows[0].uuid).map((g) => g.rows[0].chineseTerm);

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

  // ── Auto-import: submit one chunk at a time via fetcher ──
  const handleImportAll = () => {
    const remaining = groups.slice(chunkIndex * CHUNK_SIZE);
    const queue: GlossaryImportRow[][] = [];
    for (let i = 0; i < remaining.length; i += CHUNK_SIZE) {
      queue.push(remaining.slice(i, i + CHUNK_SIZE).flatMap((g) => g.rows));
    }
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
          <CardTitle className="text-primary text-2xl">Import Glossary</CardTitle>
          <CardDescription className="text-base">
            Upload a CSV or XLSX file to review and import glossary entries in chunks of {CHUNK_SIZE} terms at a time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <label
              htmlFor="glossary-import-file"
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

      {/* ── Progress + Import All ── */}
      {totalGroups > 0 && (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-foreground font-medium">
              {isAllDone ? 'Import complete' : `Chunk ${chunkIndex + 1} of ${totalChunks}`}
            </span>
            <span className="text-muted-foreground">
              {totalGroups} terms &middot; {totalCsvRows} CSV rows
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
              <Button
                size="sm"
                variant="secondary"
                onClick={handleImportAll}
                disabled={isSubmitting || isAutoImporting}
              >
                {isAutoImporting ? (
                  <>
                    <Icons.Loader className="mr-2 h-3 w-3 animate-spin" />
                    Importing all…
                  </>
                ) : (
                  'Import All'
                )}
              </Button>
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
              Import Complete
            </CardTitle>
            <CardDescription>
              {totalGroups} terms from file &middot; {totalCsvRows} CSV rows processed
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
                <p className="text-muted-foreground text-xs">existing entries overwritten</p>
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

      {/* ── Comparison panel ── */}
      {totalGroups > 0 && !isAllDone && currentChunk.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-primary flex items-center gap-2 text-xl">
              <ArrowLeftRight className="h-5 w-5" />
              Chunk {chunkIndex + 1} of {totalChunks}
            </CardTitle>
            <CardDescription className="text-base">
              Reviewing {currentChunk.length} {currentChunk.length === 1 ? 'term' : 'terms'} ({currentChunkRows.length}{' '}
              CSV {currentChunkRows.length === 1 ? 'row' : 'rows'}). Upload a new file above to start over.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoadingExisting ? (
              <div className="text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm">
                <Icons.Loader className="h-4 w-4 animate-spin" />
                Loading comparison data…
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {/* Left: current database state */}
                <div>
                  <h4 className="text-primary mb-3 text-base font-medium">Current Database</h4>
                  <div className="space-y-2">
                    {currentChunk.map((group) => (
                      <GlossaryTermCard group={group} key={group.key} variant="existing" />
                    ))}
                  </div>
                </div>

                {/* Right: incoming from file */}
                <div>
                  <h4 className="text-primary mb-3 text-base font-medium">
                    Incoming from File{' '}
                    <span className="text-muted-foreground text-sm font-normal">
                      ({currentChunk.filter((g) => !g.existing).length} new,{' '}
                      {currentChunk.filter((g) => g.existing).length} updates)
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
              <Button variant="secondary" onClick={handleImportAll} disabled={isSubmitting || isAutoImporting}>
                {isAutoImporting ? (
                  <>
                    <Icons.Loader className="h-4 w-4 animate-spin" />
                    Importing all…
                  </>
                ) : (
                  'Import All'
                )}
              </Button>
              <Form method="post">
                <input type="hidden" name="intent" value="import-chunk" />
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

      <ImportInstructions />
    </div>
  );
}
