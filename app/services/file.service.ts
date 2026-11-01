/**
 * =============================================================================
 * file.service.ts  —  CLIENT-SAFE
 * =============================================================================
 *
 * Pure file-parsing and export helpers. No database access.
 * Safe to import from both server (loader/action) and client (component) code.
 *
 * For DB-backed helpers (e.g. getExistingDataPreviewForRollId) see:
 *   ~/services/file.server.ts
 */

// ─────────────────────────────────────────────────────────────────────────────
// External dependencies
// ─────────────────────────────────────────────────────────────────────────────

import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import 'dotenv/config';

import { LocalizedError } from '~/i18n/errors';

import { type IParagraph } from './paragraph.service';

// =============================================================================
// SECTION 1: Excel-layer types & constants
// =============================================================================

export interface ExcelTranslationRow {
  origin: string;
  target: string | null;
  // Optional passage key supplied by a `passage_key` column. When present it is
  // the shared identity for this row across every document (origin, translation
  // and references), so re-imports can match paragraphs by key instead of
  // position. Null when the file has no passage_key column.
  passageKey: string | null;
  // Reference cells keyed by column header — the header is the reference
  // document's key (see reference importing in file.server.ts).
  references: { sutraName?: string; content?: string }[];
  // Paragraph metadata cells from `<document key>.<field>` columns, one entry
  // per such column, INCLUDING empty cells: an empty value clears that field on
  // import, while a field with no column is left alone. Optional so rows built
  // elsewhere (exports, tests) need not carry it.
  metadata?: ParagraphMetadataCell[];
}

export interface ParagraphMetadataCell {
  // The document key the column belongs to, as given in ImportColumnKeys.
  documentKey: string;
  // Everything after `<document key>.`, lowercased — any string, dots included.
  field: string;
  value: string;
}

const COLUMN_HEADERS_ORIGIN = 'Origin';
const COLUMN_HEADERS_TARGET = 'Translation';

// Columns are identified by each document's `key`: the origin document's key
// heads the origin column, the translation document's key heads the translation
// column, and each reference document's key heads its own column. The importer
// passes the origin/target keys in (either may be null if that document has no
// key); a `passage_key` column is the one reserved header that never maps to a
// document. Every column is optional — a file may carry any subset of the
// documents (see file.server.ts); the service aligns them by passage key and/or
// position.
export interface ImportColumnKeys {
  originKey: string | null;
  targetKey: string | null;
  // The project's reference document keys. Only needed to recognise their
  // metadata columns (`<reference key>.page`); reference content columns are
  // still taken from whatever headers are left over.
  referenceKeys?: string[];
}

const PASSAGE_KEY_HEADERS = new Set(['passage_key', 'passagekey', 'passage key']);

const normaliseHeader = (header: string): string => header.trim().toLowerCase();

// A paragraph metadata column: `<document key>.<field>`. The key is matched
// case-insensitively against the known document keys, longest first, so keys
// and field names may both contain dots (`T09.a.page` with keys `T09` and
// `T09.a` is field `page` of `T09.a`). Field names are lowercased, so `Page`
// and `page` are the same field. Undefined when no key prefixes the header or
// nothing follows the dot.
export function matchMetadataHeader(
  header: string,
  documentKeys: string[],
): { documentKey: string; field: string } | undefined {
  const normalised = normaliseHeader(header);
  const documentKey = [...documentKeys]
    .sort((a, b) => b.length - a.length)
    .find((key) => normalised.startsWith(`${normaliseHeader(key)}.`));
  if (!documentKey) return undefined;
  const field = normaliseHeader(normalised.slice(normaliseHeader(documentKey).length + 1));
  return field ? { documentKey, field } : undefined;
}

// Classify a file's headers against the document keys. Origin/target are matched
// by key (case-insensitive) when their key is known; the reserved passage_key
// header is pulled out; `<document key>.<field>` headers are metadata columns;
// every remaining non-empty header is a reference column (its text is the
// reference document key). An exact key match wins over a metadata match, so a
// reference keyed `T09.page` still reads as content.
export function classifyHeaders(headers: string[], keys: ImportColumnKeys) {
  const originKey = keys.originKey ? normaliseHeader(keys.originKey) : null;
  const targetKey = keys.targetKey ? normaliseHeader(keys.targetKey) : null;
  const documentKeys = [keys.originKey, keys.targetKey, ...(keys.referenceKeys ?? [])].filter(
    (k): k is string => !!k?.trim(),
  );
  const isDocumentKey = (h: string) => documentKeys.some((k) => normaliseHeader(k) === normaliseHeader(h));

  const originHeader = originKey ? headers.find((h) => normaliseHeader(h) === originKey) : undefined;
  const targetHeader = targetKey ? headers.find((h) => normaliseHeader(h) === targetKey) : undefined;
  const passageHeader = headers.find((h) => PASSAGE_KEY_HEADERS.has(normaliseHeader(h)));
  const metadataHeaders = headers.flatMap((header) => {
    if (header === passageHeader || isDocumentKey(header)) return [];
    const match = matchMetadataHeader(header, documentKeys);
    return match ? [{ header, ...match }] : [];
  });
  const refHeaders = headers.filter(
    (h) =>
      h.trim() !== '' &&
      h !== originHeader &&
      h !== targetHeader &&
      h !== passageHeader &&
      !metadataHeaders.some((m) => m.header === h),
  );

  return { originHeader, targetHeader, passageHeader, metadataHeaders, refHeaders };
}

// A row carries no data when every document cell is empty, every metadata cell
// is empty and no passage key is given — such rows are dropped so blank spacer
// lines don't create paragraphs.
function isEmptyRow(row: ExcelTranslationRow): boolean {
  return (
    !row.origin && !row.target && !row.passageKey && row.references.length === 0 && !row.metadata?.some((m) => m.value)
  );
}

// Applies a row's metadata cells to a paragraph's stored metadata: a value sets
// its field, an empty value removes it, fields without a cell are kept. Null
// when nothing is left, so the column stays NULL rather than `{}`.
export function mergeParagraphMetadata(
  existing: Record<string, string> | null | undefined,
  cells: Pick<ParagraphMetadataCell, 'field' | 'value'>[],
): Record<string, string> | null {
  const merged: Record<string, string> = { ...existing };
  for (const { field, value } of cells) {
    if (value) merged[field] = value;
    else delete merged[field];
  }
  return Object.keys(merged).length > 0 ? merged : null;
}

// =============================================================================
// SECTION 2: Application-layer types
// =============================================================================

export interface ParagraphReferenceView {
  id: string;
  order: string;
  sutraName: string;
  content: string;
}

export interface ParagraphUnit {
  id: string;
  order?: string;
  origin: string;
  targetId?: string;
  target: string | null;
  references?: ParagraphReferenceView[];
}

// =============================================================================
// SECTION 3: Service-layer types (import options, results, previews)
// =============================================================================

export interface ImportOptions {
  originRollId: string;
  targetRollId: string;
  originalLanguage: string;
  translationLanguage: string;
  userId: string;
}

// Import options for the refactored data model (paragraphs_new). Languages are
// a property of the documents, so only the location ids travel with the form.
export interface ImportOptionsNew {
  originDocumentId: string;
  originSectionId: string;
  targetDocumentId: string;
  userId: string;
}

export interface ImportResult {
  success: boolean;
  inserted?: number;
  deleted?: number;
  errors?: string[];
  message: string;
}

export interface ExistingDataPreview {
  paragraphs: ParagraphUnit[];
  totalParagraphs: number;
  totalReferences: number;
}

// =============================================================================
// SECTION 4: Cell-value helpers
// =============================================================================

function getCellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();

  if (typeof value === 'object' && 'richText' in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text ?? '').join('');
  }

  if (typeof value === 'object' && 'formula' in value) {
    return getCellText((value as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
  }

  if (typeof value === 'object' && 'hyperlink' in value) {
    return (value as ExcelJS.CellHyperlinkValue).text?.toString() ?? '';
  }

  return String(value);
}

// =============================================================================
// SECTION 5: Parsing — CSV and XLSX → ExcelTranslationRow[]
// =============================================================================

export async function parseCSV(fileContent: string, keys: ImportColumnKeys): Promise<ExcelTranslationRow[]> {
  return new Promise<ExcelTranslationRow[]>((resolve, reject) => {
    // No transformHeader — we need the original case for reference document keys.
    Papa.parse<Record<string, string>>(fileContent, {
      header: true,
      skipEmptyLines: true,

      complete: (results: Papa.ParseResult<Record<string, string>>): void => {
        try {
          const headers = results.meta.fields ?? [];
          const { originHeader, targetHeader, passageHeader, metadataHeaders, refHeaders } = classifyHeaders(
            headers,
            keys,
          );

          const rows: ExcelTranslationRow[] = results.data
            .map((raw): ExcelTranslationRow => {
              const origin = originHeader ? (raw[originHeader]?.trim() ?? '') : '';
              const target = targetHeader ? raw[targetHeader]?.trim() : '';
              const passageKey = passageHeader ? raw[passageHeader]?.trim() || null : null;

              const references = refHeaders
                .map((h) => ({ sutraName: h, content: raw[h]?.trim() || '' }))
                .filter((r) => r.content);

              const metadata = metadataHeaders.map(({ header, documentKey, field }) => ({
                documentKey,
                field,
                value: raw[header]?.trim() ?? '',
              }));

              return { origin, target: target || null, passageKey, references, metadata };
            })
            .filter((row) => !isEmptyRow(row));

          resolve(rows);
        } catch (error) {
          reject(error);
        }
      },

      error: (error: Error): void => reject(error),
    });
  });
}

export async function parseXLSX(fileBuffer: ArrayBuffer, keys: ImportColumnKeys): Promise<ExcelTranslationRow[]> {
  const ExcelJS = await import('exceljs');

  const workbook = new ExcelJS.default.Workbook();
  await workbook.xlsx.load(Buffer.from(fileBuffer));

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new LocalizedError('data:errors.noWorksheets');
  }

  const headerRow = worksheet.getRow(1);
  // colNumber → header text, preserving order/case so we can classify columns
  // and, for reference columns, use the header as the reference document key.
  const headersByCol: { col: number; header: string }[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const header = getCellText(cell.value).trim();
    if (header) headersByCol.push({ col: colNumber, header });
  });

  const headers = headersByCol.map((h) => h.header);
  const { originHeader, targetHeader, passageHeader, metadataHeaders, refHeaders } = classifyHeaders(headers, keys);

  const colOf = (header: string | undefined) =>
    header === undefined ? undefined : headersByCol.find((h) => h.header === header)?.col;
  const originCol = colOf(originHeader);
  const targetCol = colOf(targetHeader);
  const passageCol = colOf(passageHeader);
  const refCols = refHeaders.map((header) => ({ col: colOf(header)!, sutraName: header }));
  const metadataCols = metadataHeaders.map(({ header, documentKey, field }) => ({
    col: colOf(header)!,
    documentKey,
    field,
  }));

  const rows: ExcelTranslationRow[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const origin = originCol ? getCellText(row.getCell(originCol).value).trim() : '';
    const target = targetCol ? getCellText(row.getCell(targetCol).value).trim() : '';
    const passageKey = passageCol ? getCellText(row.getCell(passageCol).value).trim() || null : null;

    const references = refCols
      .map(({ col, sutraName }) => ({ sutraName, content: getCellText(row.getCell(col).value).trim() }))
      .filter((r) => r.content);

    const metadata = metadataCols.map(({ col, documentKey, field }) => ({
      documentKey,
      field,
      value: getCellText(row.getCell(col).value).trim(),
    }));

    const parsed: ExcelTranslationRow = { origin, target: target || null, passageKey, references, metadata };
    if (!isEmptyRow(parsed)) rows.push(parsed);
  });

  return rows;
}

// =============================================================================
// SECTION 6: Export workbook generation
// =============================================================================

export function extractReferenceSources(rows: ExcelTranslationRow[]): string[] {
  const sources = new Set<string>();
  rows.forEach((row) => {
    row.references.forEach((r) => {
      if (r.sutraName) sources.add(r.sutraName);
    });
  });
  return Array.from(sources).sort();
}

export function buildColumns(referenceSources: string[]): { header: string; key: string; width: number }[] {
  const columns = [
    { header: COLUMN_HEADERS_ORIGIN, key: 'origin', width: 40 },
    { header: COLUMN_HEADERS_TARGET, key: 'target', width: 40 },
  ];

  referenceSources.forEach((source) => {
    columns.push({ header: source, key: source, width: 40 });
  });

  return columns;
}

export function translationRowToExcelRow(row: ExcelTranslationRow, referenceSources: string[]): Record<string, string> {
  const ExcelRow: Record<string, string> = {
    origin: row.origin || '',
    target: row.target || '',
  };

  referenceSources.forEach((source) => {
    const ref = row.references.find((r) => r.sutraName === source);
    ExcelRow[source] = ref?.content || '';
  });

  return ExcelRow;
}

export async function buildExportWorkbook(rows: ExcelTranslationRow[]): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Translation Data');

  const referenceSources = extractReferenceSources(rows);
  worksheet.columns = buildColumns(referenceSources);

  rows.forEach((row) => {
    worksheet.addRow(translationRowToExcelRow(row, referenceSources));
  });

  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };

  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    });
  });

  return workbook;
}

export function buildExportFilename(date: Date = new Date()): string {
  return `export_${date.toISOString()}.xlsx`;
}

// =============================================================================
// SECTION 7: Mapping helpers (between layers)
// =============================================================================

export function toExcelRow(paragraph: IParagraph): ExcelTranslationRow {
  return {
    origin: paragraph.origin,
    target: paragraph.target,
    passageKey: null,
    references: paragraph.references.map((r) => ({
      sutraName: r.sutraName,
      content: r.content,
    })),
  };
}

export function toExcelRows(paragraphs: IParagraph[]): ExcelTranslationRow[] {
  return paragraphs.map(toExcelRow);
}
