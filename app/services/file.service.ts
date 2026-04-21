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

import { type IParagraph } from './paragraph.service';

// =============================================================================
// SECTION 1: Excel-layer types & constants
// =============================================================================

export interface ExcelTranslationRow {
  origin: string;
  target: string | null;
  references: { sutraName?: string; content?: string }[];
}

const COLUMN_HEADERS_ORIGIN = 'Origin';
const COLUMN_HEADERS_TARGET = 'Translation';

const HEADER_ALIASES: Record<string, 'origin' | 'target'> = {
  origin: 'origin',
  original: 'origin',
  target: 'target',
  translation: 'target',
};

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

export async function parseCSV(fileContent: string): Promise<ExcelTranslationRow[]> {
  return new Promise<ExcelTranslationRow[]>((resolve, reject) => {
    // No transformHeader — we need the original case for reference sutraNames.
    Papa.parse<Record<string, string>>(fileContent, {
      header: true,
      skipEmptyLines: true,

      complete: (results: Papa.ParseResult<Record<string, string>>): void => {
        const headers = results.meta.fields ?? [];

        const originHeader = headers.find((h) => HEADER_ALIASES[h.toLowerCase().trim()] === 'origin');
        const targetHeader = headers.find((h) => HEADER_ALIASES[h.toLowerCase().trim()] === 'target');
        const refHeaders = headers.filter((h) => !HEADER_ALIASES[h.toLowerCase().trim()]);

        const rows: ExcelTranslationRow[] = results.data
          .map((raw): ExcelTranslationRow | null => {
            const origin = originHeader ? raw[originHeader]?.trim() : '';
            if (!origin) return null;

            const target = targetHeader ? raw[targetHeader]?.trim() : '';

            const references = refHeaders
              .map((h) => ({ sutraName: h, content: raw[h]?.trim() || '' }))
              .filter((r) => r.content);

            return { origin, target: target || null, references };
          })
          .filter((row): row is ExcelTranslationRow => row !== null);

        resolve(rows);
      },

      error: (error: Error): void => reject(error),
    });
  });
}

export async function parseXLSX(fileBuffer: ArrayBuffer): Promise<ExcelTranslationRow[]> {
  const ExcelJS = await import('exceljs');

  const workbook = new ExcelJS.default.Workbook();
  await workbook.xlsx.load(Buffer.from(fileBuffer));

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return [];
  }

  const headerRow = worksheet.getRow(1);
  const columnMapping: Map<number, 'origin' | 'target'> = new Map();
  // colNumber → original header text (preserved case) for reference columns
  const refCols: Map<number, string> = new Map();

  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const originalHeader = getCellText(cell.value).trim();
    const canonical = HEADER_ALIASES[originalHeader.toLowerCase()];
    if (canonical) {
      columnMapping.set(colNumber, canonical);
    } else if (originalHeader) {
      refCols.set(colNumber, originalHeader);
    }
  });

  const originCol = [...columnMapping.entries()].find(([, v]) => v === 'origin')?.[0];
  if (originCol === undefined) {
    return [];
  }

  const targetCol = [...columnMapping.entries()].find(([, v]) => v === 'target')?.[0];

  const rows: ExcelTranslationRow[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const origin = getCellText(row.getCell(originCol).value).trim();
    if (!origin) return;

    const target = targetCol ? getCellText(row.getCell(targetCol).value).trim() : '';

    const references = [...refCols.entries()]
      .map(([colNum, sutraName]) => ({ sutraName, content: getCellText(row.getCell(colNum).value).trim() }))
      .filter((r) => r.content);

    rows.push({ origin, target: target || null, references });
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
    references: paragraph.references.map((r) => ({
      sutraName: r.sutraName,
      content: r.content,
    })),
  };
}

export function toExcelRows(paragraphs: IParagraph[]): ExcelTranslationRow[] {
  return paragraphs.map(toExcelRow);
}
