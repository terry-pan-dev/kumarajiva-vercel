import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import {
  type ExcelTranslationRow,
  buildColumns,
  buildExportFilename,
  buildExportWorkbook,
  extractReferenceSources,
  parseCSV,
  parseXLSX,
  translationRowToExcelRow,
} from '../file.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeParagraph = (overrides: Partial<ExcelTranslationRow> = {}): ExcelTranslationRow => ({
  origin: '原文',
  target: 'Translation',
  references: [],
  ...overrides,
});

const sampleParagraphs: ExcelTranslationRow[] = [
  makeParagraph({
    origin: 'Origin A',
    target: 'Target A',
    references: [
      { sutraName: 'Cleary', content: 'Cleary text A' },
      { sutraName: 'Kalavinka', content: 'Kalavinka text A' },
    ],
  }),
  makeParagraph({
    origin: 'Origin B',
    target: 'Target B',
    references: [{ sutraName: 'Cleary', content: 'Cleary text B' }],
  }),
  makeParagraph({
    origin: 'Origin C',
    target: '',
    references: [
      { sutraName: 'Kalavinka', content: 'Kalavinka text C' },
      { sutraName: 'BTTS', content: 'BTTS text C' },
    ],
  }),
];

/** Build an in-memory XLSX buffer from a simple column/row spec. */
async function buildXlsx(
  columns: { header: string; key: string }[],
  rows: Record<string, string | null>[],
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.columns = columns.map((c) => ({ ...c, width: 40 }));
  for (const row of rows) ws.addRow(row);
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

// ─── extractReferenceSources ─────────────────────────────────────────────────

describe('extractReferenceSources', () => {
  it('returns sorted unique source names', () => {
    expect(extractReferenceSources(sampleParagraphs)).toEqual(['BTTS', 'Cleary', 'Kalavinka']);
  });

  it('returns empty array when no references exist', () => {
    expect(extractReferenceSources([makeParagraph()])).toEqual([]);
  });

  it('skips references without sutraName', () => {
    const paragraphs = [
      makeParagraph({
        references: [{ content: 'no name' }, { sutraName: 'Named', content: 'has name' }],
      }),
    ];
    expect(extractReferenceSources(paragraphs)).toEqual(['Named']);
  });

  it('deduplicates sources across paragraphs', () => {
    const paragraphs = [
      makeParagraph({ references: [{ sutraName: 'Cleary', content: 'a' }] }),
      makeParagraph({ references: [{ sutraName: 'Cleary', content: 'b' }] }),
    ];
    expect(extractReferenceSources(paragraphs)).toEqual(['Cleary']);
  });
});

// ─── buildColumns ─────────────────────────────────────────────────────────────

describe('buildColumns', () => {
  it('returns base columns when no references', () => {
    const cols = buildColumns([]);
    expect(cols).toEqual([
      { header: 'Origin', key: 'origin', width: 40 },
      { header: 'Translation', key: 'target', width: 40 },
    ]);
  });

  it('appends a column per reference source', () => {
    const cols = buildColumns(['Cleary', 'Kalavinka']);
    expect(cols).toHaveLength(4);
    expect(cols[2]).toEqual({ header: 'Cleary', key: 'Cleary', width: 40 });
    expect(cols[3]).toEqual({ header: 'Kalavinka', key: 'Kalavinka', width: 40 });
  });
});

// ─── translationRowToExcelRow ─────────────────────────────────────────────────

describe('paragraphToRow', () => {
  const sources = ['BTTS', 'Cleary', 'Kalavinka'];

  it('maps origin and target', () => {
    const row = translationRowToExcelRow(sampleParagraphs[0], sources);
    expect(row.origin).toBe('Origin A');
    expect(row.target).toBe('Target A');
  });

  it('maps matching reference content', () => {
    const row = translationRowToExcelRow(sampleParagraphs[0], sources);
    expect(row['Cleary']).toBe('Cleary text A');
    expect(row['Kalavinka']).toBe('Kalavinka text A');
  });

  it('uses empty string for missing reference', () => {
    const row = translationRowToExcelRow(sampleParagraphs[0], sources);
    expect(row['BTTS']).toBe('');
  });

  it('uses empty string for missing origin/target', () => {
    const row = translationRowToExcelRow(
      makeParagraph({ origin: undefined as unknown as string, target: undefined }),
      [],
    );
    expect(row.origin).toBe('');
    expect(row.target).toBe('');
  });
});

// ─── buildExportWorkbook ──────────────────────────────────────────────────────

describe('buildExportWorkbook', () => {
  it('creates a workbook with correct sheet name', async () => {
    const wb = await buildExportWorkbook(sampleParagraphs);
    const ws = wb.getWorksheet('Translation Data');
    expect(ws).toBeDefined();
  });

  it('has header row + data rows', async () => {
    const wb = await buildExportWorkbook(sampleParagraphs);
    const ws = wb.getWorksheet('Translation Data')!;
    expect(ws.rowCount).toBe(sampleParagraphs.length + 1);
  });

  it('header row is bold with fill', async () => {
    const wb = await buildExportWorkbook(sampleParagraphs);
    const ws = wb.getWorksheet('Translation Data')!;
    const headerRow = ws.getRow(1);
    expect(headerRow.font).toMatchObject({ bold: true });
    expect(headerRow.fill).toMatchObject({
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    });
  });

  it('data cells have wrapText alignment', async () => {
    const wb = await buildExportWorkbook(sampleParagraphs);
    const ws = wb.getWorksheet('Translation Data')!;
    const cell = ws.getRow(2).getCell(1);
    expect(cell.alignment).toMatchObject({ wrapText: true });
  });

  it('columns match expected count', async () => {
    const wb = await buildExportWorkbook(sampleParagraphs);
    const ws = wb.getWorksheet('Translation Data')!;
    // 2 base + 3 reference sources (BTTS, Cleary, Kalavinka)
    expect(ws.columns?.length).toBe(5);
  });

  it('produces a valid xlsx buffer', async () => {
    const wb = await buildExportWorkbook(sampleParagraphs);
    const buffer = await wb.xlsx.writeBuffer();
    expect(buffer).toBeInstanceOf(Buffer);
    expect((buffer as Buffer).length).toBeGreaterThan(0);

    // Round-trip: read back and verify
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buffer as Buffer);
    const ws2 = wb2.getWorksheet('Translation Data')!;
    expect(ws2.getRow(2).getCell(1).value).toBe('Origin A');
  });

  it('handles paragraphs with no references', async () => {
    const paragraphs = [makeParagraph({ references: [] })];
    const wb = await buildExportWorkbook(paragraphs);
    const ws = wb.getWorksheet('Translation Data')!;
    expect(ws.columns?.length).toBe(2);
    expect(ws.rowCount).toBe(2);
  });
});

// ─── buildExportFilename ──────────────────────────────────────────────────────

describe('buildExportFilename', () => {
  it('contains export prefix and .xlsx extension', () => {
    const name = buildExportFilename();
    expect(name).toMatch(/^export_.*\.xlsx$/);
  });

  it('uses the provided date', () => {
    const date = new Date('2025-01-15T12:00:00.000Z');
    const name = buildExportFilename(date);
    expect(name).toBe('export_2025-01-15T12:00:00.000Z.xlsx');
  });
});

// ─── parseCSV ────────────────────────────────────────────────────────────────

describe('parseCSV', () => {
  it('parses origin and target', async () => {
    const csv = `origin,translation\n諸法因緣生,All dharmas arise\n諸法因緣滅,All dharmas cease`;
    const rows = await parseCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ origin: '諸法因緣生', target: 'All dharmas arise', references: [] });
    expect(rows[1]).toMatchObject({ origin: '諸法因緣滅', target: 'All dharmas cease', references: [] });
  });

  it('accepts header aliases (original / target)', async () => {
    const csv = `original,target\nfoo,bar`;
    const rows = await parseCSV(csv);
    expect(rows[0]).toMatchObject({ origin: 'foo', target: 'bar' });
  });

  it('is case-insensitive for known headers (Origin, TRANSLATION)', async () => {
    const csv = `Origin,TRANSLATION\nfoo,bar`;
    const rows = await parseCSV(csv);
    expect(rows[0]).toMatchObject({ origin: 'foo', target: 'bar' });
  });

  it('sets target to null when translation column is absent', async () => {
    const csv = `origin\nfoo`;
    const rows = await parseCSV(csv);
    expect(rows[0].target).toBeNull();
  });

  it('sets target to null when cell is empty', async () => {
    const csv = `origin,translation\nfoo,`;
    const rows = await parseCSV(csv);
    expect(rows[0].target).toBeNull();
  });

  it('captures extra columns as references with original-case sutraName', async () => {
    const csv = `origin,translation,Diamond Sutra,Platform Sutra\nfoo,bar,ref-a,ref-b`;
    const rows = await parseCSV(csv);
    expect(rows[0].references).toEqual([
      { sutraName: 'Diamond Sutra', content: 'ref-a' },
      { sutraName: 'Platform Sutra', content: 'ref-b' },
    ]);
  });

  it('skips reference cells that are empty', async () => {
    const csv = `origin,translation,Diamond Sutra\nfoo,bar,\nbaz,qux,ref`;
    const rows = await parseCSV(csv);
    expect(rows[0].references).toHaveLength(0);
    expect(rows[1].references).toHaveLength(1);
  });

  it('skips rows with no origin', async () => {
    const csv = `origin,translation\n,bar\nfoo,baz`;
    const rows = await parseCSV(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].origin).toBe('foo');
  });

  it('trims whitespace from cells', async () => {
    const csv = `origin,translation\n  foo  ,  bar  `;
    const rows = await parseCSV(csv);
    expect(rows[0]).toMatchObject({ origin: 'foo', target: 'bar' });
  });

  it('returns empty array for empty CSV (headers only)', async () => {
    const rows = await parseCSV('origin,translation\n');
    expect(rows).toHaveLength(0);
  });
});

// ─── parseXLSX ───────────────────────────────────────────────────────────────

describe('parseXLSX', () => {
  it('parses origin and target', async () => {
    const buf = await buildXlsx(
      [
        { header: 'origin', key: 'origin' },
        { header: 'Translation', key: 'target' },
      ],
      [{ origin: '諸法因緣生', target: 'All dharmas arise' }],
    );
    const rows = await parseXLSX(buf);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ origin: '諸法因緣生', target: 'All dharmas arise', references: [] });
  });

  it('accepts header aliases (original, translation) case-insensitively', async () => {
    const buf = await buildXlsx(
      [
        { header: 'ORIGINAL', key: 'origin' },
        { header: 'translation', key: 'target' },
      ],
      [{ origin: 'foo', target: 'bar' }],
    );
    const rows = await parseXLSX(buf);
    expect(rows[0]).toMatchObject({ origin: 'foo', target: 'bar' });
  });

  it('captures extra columns as references preserving header case', async () => {
    const buf = await buildXlsx(
      [
        { header: 'origin', key: 'origin' },
        { header: 'translation', key: 'target' },
        { header: 'Diamond Sutra', key: 'ref1' },
      ],
      [{ origin: 'foo', target: 'bar', ref1: 'diamond ref' }],
    );
    const rows = await parseXLSX(buf);
    expect(rows[0].references).toEqual([{ sutraName: 'Diamond Sutra', content: 'diamond ref' }]);
  });

  it('skips empty reference cells', async () => {
    const buf = await buildXlsx(
      [
        { header: 'origin', key: 'origin' },
        { header: 'translation', key: 'target' },
        { header: 'Diamond Sutra', key: 'ref1' },
      ],
      [
        { origin: 'foo', target: 'bar', ref1: '' },
        { origin: 'baz', target: 'qux', ref1: 'ref text' },
      ],
    );
    const rows = await parseXLSX(buf);
    expect(rows[0].references).toHaveLength(0);
    expect(rows[1].references).toHaveLength(1);
  });

  it('sets target to null when cell is empty', async () => {
    const buf = await buildXlsx(
      [
        { header: 'origin', key: 'origin' },
        { header: 'translation', key: 'target' },
      ],
      [{ origin: 'foo', target: '' }],
    );
    const rows = await parseXLSX(buf);
    expect(rows[0].target).toBeNull();
  });

  it('skips rows where origin is empty', async () => {
    const buf = await buildXlsx(
      [
        { header: 'origin', key: 'origin' },
        { header: 'translation', key: 'target' },
      ],
      [
        { origin: '', target: 'bar' },
        { origin: 'foo', target: 'baz' },
      ],
    );
    const rows = await parseXLSX(buf);
    expect(rows).toHaveLength(1);
    expect(rows[0].origin).toBe('foo');
  });

  it('returns empty array when origin column is absent', async () => {
    const buf = await buildXlsx([{ header: 'translation', key: 'target' }], [{ target: 'bar' }]);
    const rows = await parseXLSX(buf);
    expect(rows).toHaveLength(0);
  });
});
