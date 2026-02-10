import ExcelJS from 'exceljs';

export interface ExportParagraph {
  id: string;
  origin: string;
  target: string | null;
  references: { sutraName?: string; content?: string }[];
}

/**
 * Extract unique, sorted reference source names from paragraphs.
 */
export function extractReferenceSources(paragraphs: ExportParagraph[]): string[] {
  const sources = new Set<string>();
  paragraphs.forEach((p) => {
    p.references.forEach((r) => {
      if (r.sutraName) sources.add(r.sutraName);
    });
  });
  return Array.from(sources).sort();
}

/**
 * Build column definitions for the export worksheet.
 */
export function buildColumns(referenceSources: string[]): { header: string; key: string; width: number }[] {
  const columns = [
    { header: 'Origin', key: 'origin', width: 40 },
    { header: 'Translation', key: 'target', width: 40 },
  ];

  referenceSources.forEach((source) => {
    columns.push({ header: source, key: source, width: 40 });
  });

  return columns;
}

/**
 * Convert a paragraph into a flat row object keyed by column.
 */
export function paragraphToRow(paragraph: ExportParagraph, referenceSources: string[]): Record<string, string> {
  const row: Record<string, string> = {
    origin: paragraph.origin || '',
    target: paragraph.target || '',
  };

  referenceSources.forEach((source) => {
    const ref = paragraph.references.find((r) => r.sutraName === source);
    row[source] = ref?.content || '';
  });

  return row;
}

/**
 * Build a styled ExcelJS workbook from paragraphs.
 */
export async function buildExportWorkbook(paragraphs: ExportParagraph[]): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Translation Data');

  const referenceSources = extractReferenceSources(paragraphs);
  worksheet.columns = buildColumns(referenceSources);

  paragraphs.forEach((p) => {
    worksheet.addRow(paragraphToRow(p, referenceSources));
  });

  // Styling
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

/**
 * Generate the export filename.
 */
export function buildExportFilename(date: Date = new Date()): string {
  return `export_${date.toISOString()}.xlsx`;
}
