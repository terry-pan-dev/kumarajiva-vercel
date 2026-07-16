import { type ReadGlossary } from '~/drizzle/tables';

// Column order and names must match what the import parser reads (see XLSX_COLUMNS /
// parseGlossaryCSV in glossary.parse.ts), so a downloaded file round-trips back through import.
export const GLOSSARY_EXPORT_HEADERS = [
  'UUID',
  'ChineseTerm',
  'EnglishTerm',
  'ChineseSutraText',
  'EnglishSutraText',
  'SutraName',
  'Volume',
  'CBetaFrequency',
  'Author',
  'Phonetic',
] as const;

export type GlossaryExportRow = Record<(typeof GLOSSARY_EXPORT_HEADERS)[number], string>;

export type GlossaryExportFormat = 'csv' | 'xlsx';

// Flattens each entry to one row per translation. An entry with no translations contributes no
// rows — matching the original CSV export, and the fact that a term without an EnglishTerm has
// nothing to export.
export function glossariesToExportRows(glossaries: ReadGlossary[]): GlossaryExportRow[] {
  return glossaries.flatMap((glossary) =>
    (glossary.translations ?? []).map((t) => ({
      UUID: glossary.id ?? '',
      ChineseTerm: glossary.glossary ?? '',
      EnglishTerm: t.glossary ?? '',
      ChineseSutraText: t.originSutraText ?? '',
      EnglishSutraText: t.targetSutraText ?? '',
      SutraName: t.sutraName ?? '',
      Volume: t.volume ?? '',
      CBetaFrequency: glossary.cbetaFrequency ?? '',
      Author: t.author ?? '',
      Phonetic: glossary.phonetic ?? '',
    })),
  );
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

function escapeCSVValue(value: string): string {
  const shouldQuote = /[",\n]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return shouldQuote ? `"${escaped}"` : escaped;
}

export function glossariesToCSV(glossaries: ReadGlossary[]): string {
  const rows = glossariesToExportRows(glossaries);
  // Headers come from the fixed column list rather than the first row, so an empty glossary
  // still produces a valid, importable header line.
  const lines = [
    GLOSSARY_EXPORT_HEADERS.join(','),
    ...rows.map((row) => GLOSSARY_EXPORT_HEADERS.map((header) => escapeCSVValue(row[header])).join(',')),
  ];
  return lines.join('\n');
}

// ─── XLSX ─────────────────────────────────────────────────────────────────────

// Builds an .xlsx workbook as bytes. SheetJS is dynamically imported so this module carries no
// static dependency on it — only the download loaders that call this pull it in, on the server.
export async function glossariesToXLSX(glossaries: ReadGlossary[]): Promise<Uint8Array> {
  const { utils, write } = await import('xlsx');

  const rows = glossariesToExportRows(glossaries);
  // Array-of-arrays keeps the column order fixed and preserves the header row even when there
  // are no data rows, so an empty glossary still exports a valid, importable file.
  const aoa: string[][] = [
    [...GLOSSARY_EXPORT_HEADERS],
    ...rows.map((row) => GLOSSARY_EXPORT_HEADERS.map((header) => row[header])),
  ];

  const worksheet = utils.aoa_to_sheet(aoa);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, 'Glossary');

  return write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

// ─── Response ───────────────────────────────────────────────────────────────

const CONTENT_TYPES: Record<GlossaryExportFormat, string> = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const FILENAMES: Record<GlossaryExportFormat, string> = {
  csv: 'glossary.csv',
  xlsx: 'glossary.xlsx',
};

// Excel is the default; only an explicit ?format=csv opts out. Anything else falls back to xlsx.
export function parseExportFormat(value: string | null | undefined): GlossaryExportFormat {
  return value === 'csv' ? 'csv' : 'xlsx';
}

// Shared Response so both download routes agree on content type, filename and body per format.
export async function glossaryDownloadResponse(
  glossaries: ReadGlossary[],
  format: GlossaryExportFormat,
): Promise<Response> {
  const body = format === 'csv' ? glossariesToCSV(glossaries) : await glossariesToXLSX(glossaries);
  return new Response(body, {
    headers: {
      'Content-Type': CONTENT_TYPES[format],
      'Content-Disposition': `attachment; filename="${FILENAMES[format]}"`,
    },
  });
}
