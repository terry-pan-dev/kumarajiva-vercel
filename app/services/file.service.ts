/**
 * =============================================================================
 * file.service.ts
 * =============================================================================
 *
 * Service for exporting paragraph/translation data.
 *
 * This module enforces separation of concerns across three data layers:
 *
 *   1. **Excel layer** — The shape of data as it appears in spreadsheets
 *      (CSV/XLSX). These types have no IDs, no ordering metadata — just
 *      content columns: origin text, translation text, and reference text
 *      keyed by sutra name.
 *      Types: `ExcelTranslationRow`, `ExcelReference`
 *
 *   2. **Database layer** — The shape of data as stored in the DB. Origin
 *      and translation are separate rows linked by `parentId`. References
 *      are a separate table with ordering. These structures are handled
 *      exclusively inside `db*` functions which isolate all transactions.
 *      Types: (Drizzle schema types — `CreateParagraph`, etc.)
 *
 *   3. **Application layer** — The shape used by the website/UI. This is
 *      essentially the Excel shape enriched with IDs and ordering so the
 *      UI can track, sort, and link back to DB records.
 *      Types: `ParagraphUnit`, `ParagraphReferenceView`
 *
 * Data flow:
 *   - Import:  Excel file → ExcelTranslationRow[] → UI → db functions
 *   - Export:  db functions → ParagraphUnit[] → ExcelTranslationRow[] → workbook
 *   - Preview: db functions → ParagraphUnit[] → UI
 *
 * Sections (in order):
 *   - Excel-layer types & constants
 *   - Application-layer types
 *   - Service-layer types (import options, results, previews)
 *   - Cell-value helpers (ExcelJS quirks)
 *   - Parsing: CSV and XLSX → ExcelTranslationRow[]
 *   - Export workbook generation
 *   - Mapping helpers (between layers)
 */

// ─────────────────────────────────────────────────────────────────────────────
// External dependencies
// ─────────────────────────────────────────────────────────────────────────────

import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import 'dotenv/config';

import { type IParagraph, readParagraphsByRollId } from './paragraph.service';

// =============================================================================
// SECTION 1: Excel-layer types & constants
// =============================================================================
//
// These types represent the shape of data in spreadsheets. They contain
// NO database metadata (no IDs, no ordering) — purely content.
// =============================================================================

/**
 * A single row in an import/export spreadsheet.
 *
 * This is the pure file-level representation with no database metadata.
 * On import, `references` is optional. On export, references are populated
 * from the database before being written to the workbook.
 */
export interface ExcelTranslationRow {
  /** The original-language text (always required). */
  origin: string;
  /** The translation text (optional on import). */
  target?: string;
  /** Associated sutra references (populated on export, optional on import). */
  references: { sutraName?: string; content?: string }[];
}

/**
 * The canonical column headers used in exported spreadsheets.
 *
 * The import parser normalises incoming headers to lowercase and matches
 * against these (also lowercased), plus legacy aliases like "original" →
 * "origin" and "translation" → "target".
 */
const COLUMN_HEADERS_ORIGIN = 'Origin';
const COLUMN_HEADERS_TARGET = 'Translation';

/**
 * When importing, we accept these aliases
 */
const HEADER_ALIASES: Record<string, 'origin' | 'target'> = {
  origin: 'origin',
  original: 'origin',
  target: 'target',
  translation: 'target',
};

// =============================================================================
// SECTION 2: Application-layer types
// =============================================================================
//
// These types are the Excel shape enriched with IDs and ordering — what
// the website/UI works with. They bridge the file format and the database.
// =============================================================================

/**
 * A reference as viewed by the application/UI.
 *
 * Extends the Excel reference shape with database identity and ordering.
 */
export interface ParagraphReferenceView {
  /** Database ID of this reference record. */
  id: string;
  /** Sort key within the paragraph's reference list. */
  order: string;
  /** The name of the source sutra this reference points to. */
  sutraName: string;
  /** The actual reference text / content. */
  content: string;
}

/**
 * The application-layer representation of a paragraph + its translation.
 *
 * This is what the website works with: the Excel-level content (origin,
 * target, references) enriched with IDs so the UI can track records.
 *
 * ┌──────────────┬─────────────────────────────────────────────────────────┐
 * │ Field        │ Notes                                                   │
 * ├──────────────┼─────────────────────────────────────────────────────────┤
 * │ id           │ Database ID of the origin paragraph.                    │
 * │ order        │ Sort key string (e.g. "1", "2", …).                    │
 * │ origin       │ The original-language text.                             │
 * │ translationId│ Database ID of the translation paragraph (if exists).   │
 * │ target       │ The translation text (if exists).                       │
 * │ references   │ Associated sutra references with full DB metadata.      │
 * └──────────────┴─────────────────────────────────────────────────────────┘
 */
export interface ParagraphUnit {
  /** Database ID of the origin paragraph. */
  id: string;
  /** Sort key string (e.g. "1", "2", …). */
  order?: string;
  /** The original-language text. */
  origin: string;
  /** Database ID of the translation (child) paragraph, if it exists. */
  targetId?: string;
  /** The translation text, if it exists. */
  target?: string;
  /** Associated sutra references with IDs and ordering. */
  references?: ParagraphReferenceView[];
}

// =============================================================================
// SECTION 3: Service-layer types (import options, results, previews)
// =============================================================================

export const PREVIEW_LIMIT = 5;

/**
 * Options that the caller must provide when importing data into a roll.
 *
 * These tell the import function which roll to target, what languages the
 * columns represent, and who is performing the import (for audit fields).
 */

export interface ImportOptions {
  sutraId: string;
  rollId: string;
  sutraName: string;
  /** Language of the "origin" column (e.g. 'chinese'). */
  originalLanguage: string;
  /** Language of the "target" / translation column. */
  translationLanguage: string;
  /** ID of the user performing the import (written to createdBy / updatedBy). */
  userId: string;
}

/**
 * The result returned after an import (replace) operation.
 */
export interface ImportResult {
  success: boolean;
  inserted?: number;
  deleted?: number;
  errors?: string[];
  message: string;
}

/**
 * A preview of the data that currently exists in the database for a given roll.
 *
 * This is used by the UI to show the user what will be replaced before they
 * confirm an import. It contains a limited number of `ParagraphUnit` rows
 * plus aggregate counts.
 */
export interface ExistingDataPreview {
  /** A small slice of paragraphs (with references) for the user to inspect. */
  paragraphs: ParagraphUnit[];
  /** Total number of paragraphs in the roll. */
  totalParagraphs: number;
  /** Total number of references across all paragraphs in the roll. */
  totalReferences: number;
}

// =============================================================================
// SECTION 4: Cell-value helpers
// =============================================================================
//
// ExcelJS cell values can be strings, numbers, booleans, Dates, rich-text
// objects, formula objects, hyperlink objects, or null/undefined. We need a
// single helper that reliably extracts a plain string from any of these.
// =============================================================================

/**
 * Extract a plain string from an ExcelJS CellValue.
 *
 * Handles all the variant shapes that ExcelJS can return:
 *   - Primitives (string, number, boolean)
 *   - Date objects
 *   - Rich text: `{ richText: [{ text: '...' }, ...] }`
 *   - Formulas: `{ formula: '...', result: <CellValue> }`
 *   - Hyperlinks: `{ text: '...', hyperlink: '...' }`
 *   - null / undefined
 */
function getCellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();

  // Rich text: concatenate all text segments.
  if (typeof value === 'object' && 'richText' in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text ?? '').join('');
  }

  // Formula: recursively extract the computed result.
  if (typeof value === 'object' && 'formula' in value) {
    return getCellText((value as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
  }

  // Hyperlink: use the display text.
  if (typeof value === 'object' && 'hyperlink' in value) {
    return (value as ExcelJS.CellHyperlinkValue).text?.toString() ?? '';
  }

  // Fallback for anything unexpected.
  return String(value);
}

// =============================================================================
// SECTION 5: Parsing — CSV and XLSX → ExcelTranslationRow[]
// =============================================================================
//
// Both parsers return the same `ExcelTranslationRow[]` shape. The `references`
// array will always be empty at parse time because the import spreadsheet
// format only contains origin + target columns. References are only populated
// when reading from the database (see Section 8).
// =============================================================================

/**
 * Parse a CSV string into an array of `ExcelTranslationRow`.
 *
 * Expects a header row with at least an "origin" (or "original") column.
 * A "target" (or "translation") column is optional.
 *
 * Uses PapaParse under the hood. Empty rows and rows where the origin cell
 * is blank are silently skipped.
 */
export async function parseCSV(fileContent: string): Promise<ExcelTranslationRow[]> {
  return new Promise<ExcelTranslationRow[]>((resolve, reject) => {
    Papa.parse<Record<string, string>>(fileContent, {
      header: true,
      skipEmptyLines: true,

      // Normalise every header to lowercase so we can match against HEADER_ALIASES.
      transformHeader: (header: string): string => header.toLowerCase().trim(),

      complete: (results: Papa.ParseResult<Record<string, string>>): void => {
        const rows: ExcelTranslationRow[] = results.data
          .map((raw): ExcelTranslationRow | null => {
            // Try to find the origin value using any of the accepted aliases.
            const originKey = Object.keys(raw).find((k) => HEADER_ALIASES[k] === 'origin');
            const targetKey = Object.keys(raw).find((k) => HEADER_ALIASES[k] === 'target');

            const origin = originKey ? raw[originKey]?.trim() : '';
            if (!origin) return null; // skip rows with no origin text

            const target = targetKey ? raw[targetKey]?.trim() : '';

            return {
              origin,
              target: target || undefined,
              references: [],
            };
          })
          .filter((row): row is ExcelTranslationRow => row !== null);

        resolve(rows);
      },

      error: (error: Error): void => reject(error),
    });
  });
}

/**
 * Parse an XLSX file buffer into an array of `ExcelTranslationRow`.
 *
 * Reads the first worksheet only. Expects a header row with at least an
 * "Origin" (or "Original") column. "Translation" / "Target" is optional.
 *
 * This function dynamically imports ExcelJS so the (large) library is only
 * loaded when XLSX parsing is actually needed.
 */
export async function parseXLSX(fileBuffer: ArrayBuffer): Promise<ExcelTranslationRow[]> {
  // Dynamic import keeps the initial bundle smaller for callers that only use CSV.
  const ExcelJS = await import('exceljs');

  const workbook = new ExcelJS.default.Workbook();
  await workbook.xlsx.load(Buffer.from(fileBuffer));

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return [];
  }

  // ── Step 1: Read and normalise headers ────────────────────────────────
  // We build a map of column-number → canonical field name ('origin' | 'target')
  // so that we know which columns to pull data from regardless of exact casing
  // or whether the file uses "Original" vs "Origin".

  const headerRow = worksheet.getRow(1);
  const columnMapping: Map<number, 'origin' | 'target'> = new Map();

  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const rawHeader = getCellText(cell.value).toLowerCase().trim();
    const canonical = HEADER_ALIASES[rawHeader];
    if (canonical) {
      columnMapping.set(colNumber, canonical);
    }
  });

  // We must have at least an origin column to proceed.
  const originCol = [...columnMapping.entries()].find(([, v]) => v === 'origin')?.[0];
  if (originCol === undefined) {
    return [];
  }

  const targetCol = [...columnMapping.entries()].find(([, v]) => v === 'target')?.[0];

  // ── Step 2: Read data rows (row 2 onwards) ────────────────────────────

  const rows: ExcelTranslationRow[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip the header row

    const origin = getCellText(row.getCell(originCol).value).trim();
    if (!origin) return; // skip blank origin rows

    const target = targetCol ? getCellText(row.getCell(targetCol).value).trim() : '';

    rows.push({
      origin,
      target: target || undefined,
      references: [],
    });
  });

  return rows;
}

// =============================================================================
// SECTION 6: Export workbook generation
// =============================================================================
//
// Builds a styled ExcelJS workbook from an array of ExcelTranslationRow[].
//
// The workbook has a single worksheet ("Translation Data") with:
//   - An "Origin" column
//   - A "Translation" column
//   - One additional column per unique reference source (sutra name)
//
// This means a round-trip is possible: export a roll, edit it, then re-import.
// (Reference columns are informational on export; they are not imported.)
// =============================================================================

/**
 * Collect all unique reference source names from the given rows and
 * return them sorted alphabetically.
 *
 * Each unique sutra name becomes its own column in the export spreadsheet.
 */
export function extractReferenceSources(rows: ExcelTranslationRow[]): string[] {
  const sources = new Set<string>();
  rows.forEach((row) => {
    row.references.forEach((r) => {
      if (r.sutraName) sources.add(r.sutraName);
    });
  });
  return Array.from(sources).sort();
}

/**
 * Build the column definitions for the export worksheet.
 *
 * Always includes Origin and Translation, then appends one column per
 * reference source.
 */
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

/**
 * Flatten a single ExcelTranslationRow into a plain object suitable for
 * adding as a worksheet row.
 *
 * The keys of the returned object match the `key` values in `buildColumns`,
 * so ExcelJS can automatically slot each value into the correct cell.
 */
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

/**
 * Build a complete, styled ExcelJS workbook ready for download.
 *
 * Styling applied:
 *   - Bold header row with a light-grey background.
 *   - All cells top-left aligned with word wrap enabled.
 */
export async function buildExportWorkbook(rows: ExcelTranslationRow[]): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Translation Data');

  const referenceSources = extractReferenceSources(rows);
  worksheet.columns = buildColumns(referenceSources);

  rows.forEach((row) => {
    worksheet.addRow(translationRowToExcelRow(row, referenceSources));
  });

  // ── Header row styling ──────────────────────────────────────────────
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };

  // ── Cell-level styling (all rows) ───────────────────────────────────
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    });
  });

  return workbook;
}

/**
 * Generate a timestamped filename for an export download.
 *
 * Example: "export_2025-06-15T10:30:00.000Z.xlsx"
 */
export function buildExportFilename(date: Date = new Date()): string {
  return `export_${date.toISOString()}.xlsx`;
}

// =============================================================================
// SECTION 7: Mapping helpers (between layers)
// =============================================================================
//
// These functions convert between the data layers:
//   - IParagraph (app) → ExcelTranslationRow (excel)
//   - DB row → IParagraph (app)
// =============================================================================

/**
 * Convert a IParagraph (application layer) to an ExcelTranslationRow
 * (excel layer) by stripping database metadata (IDs, ordering).
 */
export function toExcelRow(paragraph: IParagraph): ExcelTranslationRow {
  return {
    origin: paragraph.origin,
    target: paragraph.target,
    references: paragraph.references.map((r) => ({
      sutraName: r.sutraName,
      content: r.content,
    })),
  };
}

/**
 * Convert an array of IParagraphs to ExcelTranslationRows for export.
 */
export function toExcelRows(paragraphs: IParagraph[]): ExcelTranslationRow[] {
  return paragraphs.map(toExcelRow);
}

export async function getExistingDataPreviewForRollId(rollId: string): Promise<ExistingDataPreview> {
  const databaseParagraphs = await readParagraphsByRollId(rollId, PREVIEW_LIMIT);

  const totalParagraphs = databaseParagraphs.length;
  const totalReferences = databaseParagraphs.reduce((sum, p) => sum + (p.references?.length || 0), 0);

  return {
    paragraphs: databaseParagraphs.map((p) => ({
      id: p.id,
      order: p.order,
      origin: p.origin,
      translationId: p.targetId,
      target: p.target,
      references: (p.references || []).map((r) => ({
        id: r.id,
        order: r.order,
        sutraName: r.sutraName ?? '',
        content: r.content ?? '',
      })),
    })),
    totalParagraphs: totalParagraphs,
    totalReferences: totalReferences,
  };
}
