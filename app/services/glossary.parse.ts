import Papa from 'papaparse';

// Client-safe glossary file parsing.
//
// This module is imported by browser event handlers (the Preview button on the
// import/replace routes), so it must never reach into `~/lib/db.server`, Algolia
// or OpenAI — doing so would drag a `.server` module into the client bundle.
// Server-side glossary work lives in `glossary.service.ts`.

// Number of glossary terms (not rows) written per chunk.
export const CHUNK_SIZE = 15;

export type GlossaryImportRow = {
  uuid: string;
  chineseTerm: string;
  englishTerm: string;
  chineseSutraText: string;
  englishSutraText: string;
  sutraName: string;
  volume: string;
  cbetaFrequency: string;
  author: string;
  phonetic: string;
};

export type GroupedTerm = {
  key: string;
  rows: GlossaryImportRow[];
};

// Thrown for problems we can explain to the user; anything else is an unexpected parse failure.
export class GlossaryParseError extends Error {}

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
export function parseGlossaryCSV(csvText: string): GlossaryImportRow[] {
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
export async function parseGlossaryXLSX(file: File): Promise<GlossaryImportRow[]> {
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

// Dispatches on file extension. Throws GlossaryParseError for anything worth showing the user.
export async function parseGlossaryFile(file: File): Promise<GlossaryImportRow[]> {
  const lowerName = file.name.toLowerCase();

  let rows: GlossaryImportRow[];
  if (lowerName.endsWith('.csv')) {
    rows = parseGlossaryCSV(await file.text());
  } else if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
    rows = await parseGlossaryXLSX(file);
  } else {
    throw new GlossaryParseError('Invalid file type. Please upload a CSV or XLSX file.');
  }

  if (rows.length === 0) {
    throw new GlossaryParseError('No valid rows found. Ensure the file has a ChineseTerm column.');
  }

  return rows;
}

// Groups CSV/XLSX rows by UUID (if present) or Chinese term. One group = one glossary entry.
// Mirrors the keying importGlossaries uses server-side, so the preview matches what gets written.
export function groupRows(rows: GlossaryImportRow[]): GroupedTerm[] {
  const byKey = new Map<string, GlossaryImportRow[]>();
  for (const row of rows) {
    const key = row.uuid || `term:${row.chineseTerm}`;
    const bucket = byKey.get(key) ?? [];
    bucket.push(row);
    byKey.set(key, bucket);
  }
  return [...byKey.entries()].map(([key, groupRows]) => ({ key, rows: groupRows }));
}

// Splits groups into CHUNK_SIZE-term batches, flattened back to rows for posting.
export function chunkGroupsToRows(groups: GroupedTerm[]): GlossaryImportRow[][] {
  const queue: GlossaryImportRow[][] = [];
  for (let i = 0; i < groups.length; i += CHUNK_SIZE) {
    queue.push(groups.slice(i, i + CHUNK_SIZE).flatMap((g) => g.rows));
  }
  return queue;
}
