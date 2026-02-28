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
 *   - Export:  db functions → ParagraphUnit[] → ExcelTranslationRow[] → workbook
 *
 * Sections (in order):
 *   - Excel-layer types & constants
 *   - Export workbook generation
 *   - Mapping helpers (between layers)
 */

// ─────────────────────────────────────────────────────────────────────────────
// External dependencies
// ─────────────────────────────────────────────────────────────────────────────

import ExcelJS from 'exceljs';
import 'dotenv/config';

import { type IParagraph } from './paragraph.service';

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
  target: string | null;
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

// =============================================================================
// SECTION 2: Export workbook generation
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
// SECTION 3: Mapping helpers (between layers)
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
