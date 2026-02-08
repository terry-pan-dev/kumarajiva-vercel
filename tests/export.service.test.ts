import ExcelJS from 'exceljs';
import { describe, it, expect } from 'vitest';

import {
  type ExportParagraph,
  extractReferenceSources,
  buildColumns,
  paragraphToRow,
  buildExportWorkbook,
  buildExportFilename,
} from '../app/services/export.service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeParagraph = (overrides: Partial<ExportParagraph> = {}): ExportParagraph => ({
  id: 'p1',
  origin: '原文',
  target: 'Translation',
  references: [],
  ...overrides,
});

const sampleParagraphs: ExportParagraph[] = [
  makeParagraph({
    id: 'p1',
    origin: 'Origin A',
    target: 'Target A',
    references: [
      { sutraName: 'Cleary', content: 'Cleary text A' },
      { sutraName: 'Kalavinka', content: 'Kalavinka text A' },
    ],
  }),
  makeParagraph({
    id: 'p2',
    origin: 'Origin B',
    target: 'Target B',
    references: [{ sutraName: 'Cleary', content: 'Cleary text B' }],
  }),
  makeParagraph({
    id: 'p3',
    origin: 'Origin C',
    target: '',
    references: [
      { sutraName: 'Kalavinka', content: 'Kalavinka text C' },
      { sutraName: 'BTTS', content: 'BTTS text C' },
    ],
  }),
];

// ---------------------------------------------------------------------------
// extractReferenceSources
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// buildColumns
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// paragraphToRow
// ---------------------------------------------------------------------------

describe('paragraphToRow', () => {
  const sources = ['BTTS', 'Cleary', 'Kalavinka'];

  it('maps origin and target', () => {
    const row = paragraphToRow(sampleParagraphs[0], sources);
    expect(row.origin).toBe('Origin A');
    expect(row.target).toBe('Target A');
  });

  it('maps matching reference content', () => {
    const row = paragraphToRow(sampleParagraphs[0], sources);
    expect(row['Cleary']).toBe('Cleary text A');
    expect(row['Kalavinka']).toBe('Kalavinka text A');
  });

  it('uses empty string for missing reference', () => {
    const row = paragraphToRow(sampleParagraphs[0], sources);
    expect(row['BTTS']).toBe('');
  });

  it('uses empty string for missing origin/target', () => {
    const row = paragraphToRow(makeParagraph({ origin: undefined as unknown as string, target: undefined }), []);
    expect(row.origin).toBe('');
    expect(row.target).toBe('');
  });
});

// ---------------------------------------------------------------------------
// buildExportWorkbook
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// buildExportFilename
// ---------------------------------------------------------------------------

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
