import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import type { IParagraphNew } from '~/services/text.service';

import {
  buildExportFilename,
  buildExportWorkbook,
  classifyHeaders,
  matchMetadataHeader,
  mergeParagraphMetadata,
  parseCSV,
  parseXLSX,
  sectionExportColumns,
  sectionExportDocuments,
} from '~/services/file.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

// Columns are identified by document keys; these tests use "origin"/"translation"
// as the origin/translation document keys.
const KEYS = { originKey: 'origin', targetKey: 'translation' };

// A paired paragraph as readParagraphsBySectionId returns it: source T262,
// translation EN, references cleary (ref-c) and kalavinka (ref-k).
const paired = (
  passageKey: string | null,
  texts: { origin: string; target?: string; cleary?: string; kalavinka?: string },
  pages: { origin?: string; target?: string; cleary?: string; kalavinka?: string } = {},
): IParagraphNew => {
  const meta = (page?: string) => (page ? { page } : null);
  return {
    id: `p-${passageKey}`,
    order: 1,
    passageKey,
    documentId: 'd-origin',
    sectionId: 's',
    origin: texts.origin,
    target: texts.target ?? null,
    metadata: meta(pages.origin),
    targetMetadata: meta(pages.target),
    references: [
      {
        documentId: 'ref-c',
        key: 'cleary',
        title: 'Cleary',
        contributors: [],
        content: texts.cleary ?? null,
        metadata: meta(pages.cleary),
      },
      {
        documentId: 'ref-k',
        key: 'kalavinka',
        title: 'Kalavinka',
        contributors: [],
        content: texts.kalavinka ?? null,
        metadata: meta(pages.kalavinka),
      },
    ],
    histories: [],
    originComments: [],
    targetComments: [],
  };
};

const EXPORT_REFERENCES = [
  { documentId: 'ref-c', document: { key: 'cleary', title: 'Cleary' } },
  { documentId: 'ref-k', document: { key: 'kalavinka', title: 'Kalavinka' } },
];
const EXPORT_DOCUMENTS = sectionExportDocuments({ originKey: 'T262', targetKey: 'EN', references: EXPORT_REFERENCES });

const exportParagraphs = [
  paired(
    'k.1',
    { origin: '如是我聞', target: 'Thus I have heard', cleary: 'Thus have I heard' },
    { origin: '1c', cleary: '201' },
  ),
  paired('k.2', { origin: '一時', target: 'At one time', kalavinka: 'At one time' }, { kalavinka: '315' }),
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

// ─── Section export ──────────────────────────────────────────────────────────

describe('sectionExportDocuments', () => {
  it('heads each document by its key, falling back for documents without one', () => {
    const documents = sectionExportDocuments({
      originKey: null,
      targetKey: null,
      references: [{ documentId: 'r', document: { key: null, title: 'Commentary' } }],
    });
    expect(documents.map((d) => d.header)).toEqual(['Origin', 'Translation', 'Commentary']);
    expect(EXPORT_DOCUMENTS.map((d) => d.header)).toEqual(['T262', 'EN', 'cleary', 'kalavinka']);
  });
});

describe('sectionExportColumns', () => {
  const columns = sectionExportColumns(exportParagraphs, EXPORT_DOCUMENTS);

  it('leads with passage_key and puts each metadata field after its document', () => {
    expect(columns.map((c) => c.header)).toEqual([
      'passage_key',
      'T262',
      'T262.page',
      'EN',
      'cleary',
      'cleary.page',
      'kalavinka',
      'kalavinka.page',
    ]);
  });

  it('fills cells from each paragraph, empty where a document has no text or page', () => {
    const row = (p: IParagraphNew) => columns.map((c) => c.value(p));
    expect(row(exportParagraphs[0])).toEqual([
      'k.1',
      '如是我聞',
      '1c',
      'Thus I have heard',
      'Thus have I heard',
      '201',
      '',
      '',
    ]);
    expect(row(exportParagraphs[1])).toEqual(['k.2', '一時', '', 'At one time', '', '', 'At one time', '315']);
  });

  it('adds no metadata columns when no paragraph has metadata', () => {
    const plain = [paired('k.1', { origin: '如是我聞' })];
    expect(sectionExportColumns(plain, EXPORT_DOCUMENTS).map((c) => c.header)).toEqual([
      'passage_key',
      'T262',
      'EN',
      'cleary',
      'kalavinka',
    ]);
  });

  it('sorts several fields of one document', () => {
    const p = paired('k.1', { origin: 'x' });
    p.metadata = { page: '1', 'cbeta.line': 'T09n0262_p0001c01' };
    expect(
      sectionExportColumns([p], EXPORT_DOCUMENTS)
        .map((c) => c.header)
        .slice(1, 4),
    ).toEqual(['T262', 'T262.cbeta.line', 'T262.page']);
  });
});

describe('buildExportWorkbook', () => {
  const build = () => buildExportWorkbook(exportParagraphs, sectionExportColumns(exportParagraphs, EXPORT_DOCUMENTS));

  it('writes a bold, shaded header row and one wrapped row per paragraph', async () => {
    const ws = (await build()).getWorksheet('Translation Data')!;
    expect(ws.rowCount).toBe(exportParagraphs.length + 1);
    expect(ws.getRow(1).font).toMatchObject({ bold: true });
    expect(ws.getRow(1).fill).toMatchObject({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } });
    expect(ws.getRow(2).getCell(2).alignment).toMatchObject({ wrapText: true });
  });

  it('round-trips through the importer’s parser: text, passage keys and pages', async () => {
    const buffer = (await (await build()).xlsx.writeBuffer()) as ArrayBuffer;
    const rows = await parseXLSX(buffer, {
      originKey: 'T262',
      targetKey: 'EN',
      referenceKeys: ['cleary', 'kalavinka'],
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ origin: '如是我聞', target: 'Thus I have heard', passageKey: 'k.1' });
    expect(rows[0].references).toEqual([{ sutraName: 'cleary', content: 'Thus have I heard' }]);
    expect(rows[0].metadata).toEqual([
      { documentKey: 'T262', field: 'page', value: '1c' },
      { documentKey: 'cleary', field: 'page', value: '201' },
      { documentKey: 'kalavinka', field: 'page', value: '' },
    ]);
    expect(rows[1].metadata).toContainEqual({ documentKey: 'kalavinka', field: 'page', value: '315' });
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
    const rows = await parseCSV(csv, KEYS);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ origin: '諸法因緣生', target: 'All dharmas arise', references: [] });
    expect(rows[1]).toMatchObject({ origin: '諸法因緣滅', target: 'All dharmas cease', references: [] });
  });

  it('matches columns by document key', async () => {
    const csv = `original,rendering\nfoo,bar`;
    const rows = await parseCSV(csv, { originKey: 'original', targetKey: 'rendering' });
    expect(rows[0]).toMatchObject({ origin: 'foo', target: 'bar' });
  });

  it('matches keys case-insensitively (Origin, TRANSLATION)', async () => {
    const csv = `Origin,TRANSLATION\nfoo,bar`;
    const rows = await parseCSV(csv, KEYS);
    expect(rows[0]).toMatchObject({ origin: 'foo', target: 'bar' });
  });

  it('accepts a file with only the translation column (origin absent)', async () => {
    const rows = await parseCSV(`translation\nbar`, KEYS);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ origin: '', target: 'bar' });
  });

  it('accepts a file with only the origin column (translation absent)', async () => {
    const rows = await parseCSV(`origin\nfoo`, KEYS);
    expect(rows[0]).toMatchObject({ origin: 'foo', target: null });
  });

  it('accepts a file of only reference columns (no origin/translation)', async () => {
    const rows = await parseCSV(`Diamond Sutra\nref text`, KEYS);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ origin: '', target: null });
    expect(rows[0].references).toEqual([{ sutraName: 'Diamond Sutra', content: 'ref text' }]);
  });

  it('drops fully-empty rows but keeps rows with any content', async () => {
    const rows = await parseCSV(`origin,translation\n,\n,bar\nfoo,`, KEYS);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ origin: '', target: 'bar' });
    expect(rows[1]).toMatchObject({ origin: 'foo', target: null });
  });

  it('reads a passage_key column into passageKey (and never as a reference)', async () => {
    const csv = `origin,translation,passage_key\nfoo,bar,T09n0262.1.1`;
    const rows = await parseCSV(csv, KEYS);
    expect(rows[0].passageKey).toBe('T09n0262.1.1');
    expect(rows[0].references).toHaveLength(0);
  });

  it('leaves passageKey null when there is no passage_key column', async () => {
    const csv = `origin,translation\nfoo,bar`;
    const rows = await parseCSV(csv, KEYS);
    expect(rows[0].passageKey).toBeNull();
  });

  it('sets target to null when cell is empty', async () => {
    const csv = `origin,translation\nfoo,`;
    const rows = await parseCSV(csv, KEYS);
    expect(rows[0].target).toBeNull();
  });

  it('captures extra columns as references with original-case sutraName', async () => {
    const csv = `origin,translation,Diamond Sutra,Platform Sutra\nfoo,bar,ref-a,ref-b`;
    const rows = await parseCSV(csv, KEYS);
    expect(rows[0].references).toEqual([
      { sutraName: 'Diamond Sutra', content: 'ref-a' },
      { sutraName: 'Platform Sutra', content: 'ref-b' },
    ]);
  });

  it('skips reference cells that are empty', async () => {
    const csv = `origin,translation,Diamond Sutra\nfoo,bar,\nbaz,qux,ref`;
    const rows = await parseCSV(csv, KEYS);
    expect(rows[0].references).toHaveLength(0);
    expect(rows[1].references).toHaveLength(1);
  });

  it('keeps an origin-less row when another column has content', async () => {
    const csv = `origin,translation\n,bar\nfoo,baz`;
    const rows = await parseCSV(csv, KEYS);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ origin: '', target: 'bar' });
    expect(rows[1]).toMatchObject({ origin: 'foo', target: 'baz' });
  });

  it('trims whitespace from cells', async () => {
    const csv = `origin,translation\n  foo  ,  bar  `;
    const rows = await parseCSV(csv, KEYS);
    expect(rows[0]).toMatchObject({ origin: 'foo', target: 'bar' });
  });

  it('returns empty array for empty CSV (headers only)', async () => {
    const rows = await parseCSV('origin,translation\n', KEYS);
    expect(rows).toHaveLength(0);
  });
});

// ─── parseXLSX ───────────────────────────────────────────────────────────────

describe('parseXLSX', () => {
  it('parses origin and target', async () => {
    const buf = await buildXlsx(
      [
        { header: 'origin', key: 'origin' },
        { header: 'translation', key: 'target' },
      ],
      [{ origin: '諸法因緣生', target: 'All dharmas arise' }],
    );
    const rows = await parseXLSX(buf, KEYS);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ origin: '諸法因緣生', target: 'All dharmas arise', references: [] });
  });

  it('matches keys case-insensitively (ORIGIN, TRANSLATION)', async () => {
    const buf = await buildXlsx(
      [
        { header: 'ORIGIN', key: 'origin' },
        { header: 'TRANSLATION', key: 'target' },
      ],
      [{ origin: 'foo', target: 'bar' }],
    );
    const rows = await parseXLSX(buf, KEYS);
    expect(rows[0]).toMatchObject({ origin: 'foo', target: 'bar' });
  });

  it('reads a passage_key column into passageKey (and never as a reference)', async () => {
    const buf = await buildXlsx(
      [
        { header: 'origin', key: 'origin' },
        { header: 'translation', key: 'target' },
        { header: 'passage_key', key: 'passage_key' },
      ],
      [{ origin: 'foo', target: 'bar', passage_key: 'T09n0262.1.1' }],
    );
    const rows = await parseXLSX(buf, KEYS);
    expect(rows[0].passageKey).toBe('T09n0262.1.1');
    expect(rows[0].references).toHaveLength(0);
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
    const rows = await parseXLSX(buf, KEYS);
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
    const rows = await parseXLSX(buf, KEYS);
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
    const rows = await parseXLSX(buf, KEYS);
    expect(rows[0].target).toBeNull();
  });

  it('keeps an origin-less row when another column has content', async () => {
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
    const rows = await parseXLSX(buf, KEYS);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ origin: '', target: 'bar' });
    expect(rows[1]).toMatchObject({ origin: 'foo', target: 'baz' });
  });

  it('accepts a file without an origin column', async () => {
    const buf = await buildXlsx([{ header: 'translation', key: 'target' }], [{ target: 'bar' }]);
    const rows = await parseXLSX(buf, KEYS);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ origin: '', target: 'bar' });
  });

  it('drops fully-empty rows', async () => {
    const buf = await buildXlsx(
      [
        { header: 'origin', key: 'origin' },
        { header: 'translation', key: 'target' },
      ],
      [
        { origin: '', target: '' },
        { origin: 'foo', target: 'bar' },
      ],
    );
    const rows = await parseXLSX(buf, KEYS);
    expect(rows).toHaveLength(1);
    expect(rows[0].origin).toBe('foo');
  });
});

// ─── Paragraph metadata columns (`<document key>.<field>`) ──────────────────

// Origin T262, translation EN, and the reference BDK.
const META_KEYS = { originKey: 'T262', targetKey: 'EN', referenceKeys: ['BDK'] };

describe('matchMetadataHeader', () => {
  it('splits a header into its document key and field', () => {
    expect(matchMetadataHeader('BDK.page', ['T262', 'BDK'])).toEqual({ documentKey: 'BDK', field: 'page' });
  });

  it('matches the key case-insensitively and returns the key as given', () => {
    expect(matchMetadataHeader('bdk.page', ['BDK'])).toEqual({ documentKey: 'BDK', field: 'page' });
  });

  it('lowercases the field name', () => {
    expect(matchMetadataHeader('Cleary.Page', ['cleary'])).toEqual({ documentKey: 'cleary', field: 'page' });
    expect(matchMetadataHeader('T262.CBETA.Line', ['T262'])).toEqual({ documentKey: 'T262', field: 'cbeta.line' });
  });

  it('keeps dots in the field name', () => {
    expect(matchMetadataHeader('T262.cbeta.line', ['T262'])).toEqual({ documentKey: 'T262', field: 'cbeta.line' });
  });

  it('prefers the longest key when keys share a prefix', () => {
    expect(matchMetadataHeader('T09.a.page', ['T09', 'T09.a'])).toEqual({ documentKey: 'T09.a', field: 'page' });
    expect(matchMetadataHeader('T09.b.page', ['T09', 'T09.a'])).toEqual({ documentKey: 'T09', field: 'b.page' });
  });

  it('does not match a key without the dot, an unknown key, or an empty field', () => {
    expect(matchMetadataHeader('BDKpage', ['BDK'])).toBeUndefined();
    expect(matchMetadataHeader('XYZ.page', ['BDK'])).toBeUndefined();
    expect(matchMetadataHeader('BDK.', ['BDK'])).toBeUndefined();
  });
});

describe('classifyHeaders with metadata columns', () => {
  it('separates content, metadata, passage key and reference columns', () => {
    const result = classifyHeaders(['T262', 'EN', 'BDK', 'BDK.page', 'T262.page', 'passage_key', 'Other'], META_KEYS);
    expect(result.originHeader).toBe('T262');
    expect(result.targetHeader).toBe('EN');
    expect(result.passageHeader).toBe('passage_key');
    expect(result.metadataHeaders).toEqual([
      { header: 'BDK.page', documentKey: 'BDK', field: 'page' },
      { header: 'T262.page', documentKey: 'T262', field: 'page' },
    ]);
    expect(result.refHeaders).toEqual(['BDK', 'Other']);
  });

  it('treats a header that is itself a document key as content, not metadata', () => {
    const result = classifyHeaders(['T262', 'T262.a'], { ...META_KEYS, referenceKeys: ['T262.a'] });
    expect(result.metadataHeaders).toEqual([]);
    expect(result.refHeaders).toEqual(['T262.a']);
  });

  it('without reference keys, a reference metadata header falls back to a reference column', () => {
    const result = classifyHeaders(['BDK.page'], { originKey: 'T262', targetKey: 'EN' });
    expect(result.metadataHeaders).toEqual([]);
    expect(result.refHeaders).toEqual(['BDK.page']);
  });
});

describe('mergeParagraphMetadata', () => {
  it('sets fields from filled cells', () => {
    expect(mergeParagraphMetadata(null, [{ field: 'page', value: '14' }])).toEqual({ page: '14' });
  });

  it('overwrites a field and keeps fields without a cell', () => {
    expect(mergeParagraphMetadata({ page: '1', 'cbeta.line': 'x' }, [{ field: 'page', value: '2' }])).toEqual({
      page: '2',
      'cbeta.line': 'x',
    });
  });

  it('removes a field for an empty cell', () => {
    expect(mergeParagraphMetadata({ page: '1', other: 'y' }, [{ field: 'page', value: '' }])).toEqual({ other: 'y' });
  });

  it('returns null when nothing is left', () => {
    expect(mergeParagraphMetadata({ page: '1' }, [{ field: 'page', value: '' }])).toBeNull();
    expect(mergeParagraphMetadata(undefined, [])).toBeNull();
  });
});

describe('parseCSV metadata columns', () => {
  it('reads metadata cells per row, including empty ones', async () => {
    const csv = `T262,BDK,BDK.page,passage_key\n如是我聞,Thus have I heard,14,k.1\n爾時,At that time,,k.2`;
    const rows = await parseCSV(csv, META_KEYS);
    expect(rows).toHaveLength(2);
    expect(rows[0].metadata).toEqual([{ documentKey: 'BDK', field: 'page', value: '14' }]);
    expect(rows[1].metadata).toEqual([{ documentKey: 'BDK', field: 'page', value: '' }]);
    expect(rows[0].references).toEqual([{ sutraName: 'BDK', content: 'Thus have I heard' }]);
  });

  it('keeps a row that only has a page number', async () => {
    const rows = await parseCSV(`BDK.page\n14`, META_KEYS);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ origin: '', target: null, references: [] });
    expect(rows[0].metadata).toEqual([{ documentKey: 'BDK', field: 'page', value: '14' }]);
  });

  it('drops a row whose only cell is an empty page', async () => {
    const rows = await parseCSV(`T262,BDK.page\nfoo,1\n,`, META_KEYS);
    expect(rows).toHaveLength(1);
  });

  it('gives every row an empty metadata list when there are no metadata columns', async () => {
    const rows = await parseCSV(`T262\nfoo`, META_KEYS);
    expect(rows[0].metadata).toEqual([]);
  });
});

describe('parseXLSX metadata columns', () => {
  it('reads metadata cells, numbers as text', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    ws.addRow(['T262', 'T262.page', 'BDK.cbeta.line']);
    ws.addRow(['如是我聞', 1, 'T09n0262_p0001c01']);
    ws.addRow(['爾時', '1c', null]);
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;

    const rows = await parseXLSX(buf, META_KEYS);
    expect(rows).toHaveLength(2);
    expect(rows[0].metadata).toEqual([
      { documentKey: 'T262', field: 'page', value: '1' },
      { documentKey: 'BDK', field: 'cbeta.line', value: 'T09n0262_p0001c01' },
    ]);
    expect(rows[1].metadata).toEqual([
      { documentKey: 'T262', field: 'page', value: '1c' },
      { documentKey: 'BDK', field: 'cbeta.line', value: '' },
    ]);
  });
});
