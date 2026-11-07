import { describe, expect, it } from 'vitest';
import { read, utils } from 'xlsx';

import {
  GLOSSARY_EXPORT_HEADERS,
  glossariesToCSV,
  glossariesToExportRows,
  glossariesToXLSX,
  parseExportFormat,
  type ExportableGlossary,
} from '~/services/glossary.export';
import { mergeTranslationsWithStatus, type MergeableTranslation } from '~/services/glossary.merge';
import {
  groupRows,
  parseGlossaryCSV,
  parseGlossaryXLSX,
  translationFromRow,
  type GlossaryImportRow,
} from '~/services/glossary.parse';
import { type GlossaryTranslation } from '~/services/glossary.types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

type Translation = GlossaryTranslation;

function makeTranslation(overrides: Partial<Translation> & { term: string }): Translation {
  return {
    language: 'english',
    sourceName: '',
    volume: '',
    updatedBy: '',
    updatedAt: '',
    ...overrides,
  } as Translation;
}

function makeGlossary(overrides: Partial<ExportableGlossary> & { sourceTerm: string }): ExportableGlossary {
  return {
    id: 'id-1',
    phonetic: null,
    cbetaFrequency: null,
    translations: [],
    ...overrides,
  } as ExportableGlossary;
}

// ─── glossariesToExportRows ──────────────────────────────────────────────────

describe('glossariesToExportRows', () => {
  it('emits one row per translation, carrying entry-level fields onto each', () => {
    const rows = glossariesToExportRows([
      makeGlossary({
        id: 'abc',
        sourceTerm: '菩薩',
        phonetic: 'púsà',
        cbetaFrequency: '500',
        translations: [
          makeTranslation({ term: 'bodhisattva', sourceName: 'Lotus', volume: '1' }),
          makeTranslation({ term: 'enlightened being' }),
        ],
      }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ UUID: 'abc', ChineseTerm: '菩薩', EnglishTerm: 'bodhisattva', Phonetic: 'púsà' });
    expect(rows[1]).toMatchObject({ ChineseTerm: '菩薩', EnglishTerm: 'enlightened being', CBetaFrequency: '500' });
  });

  it('drops entries that have no translations', () => {
    const rows = glossariesToExportRows([makeGlossary({ sourceTerm: '空', translations: [] })]);
    expect(rows).toEqual([]);
  });

  it('renders null entry/translation fields as empty strings', () => {
    const rows = glossariesToExportRows([
      makeGlossary({
        sourceTerm: '法',
        phonetic: null,
        cbetaFrequency: null,
        translations: [makeTranslation({ term: 'dharma', sourceText: null, author: null })],
      }),
    ]);

    expect(rows[0].Phonetic).toBe('');
    expect(rows[0].CBetaFrequency).toBe('');
    expect(rows[0].ChineseSutraText).toBe('');
    expect(rows[0].Author).toBe('');
  });
});

// ─── glossariesToCSV ─────────────────────────────────────────────────────────

describe('glossariesToCSV', () => {
  it('starts with the fixed header row', () => {
    const csv = glossariesToCSV([]);
    expect(csv).toBe(GLOSSARY_EXPORT_HEADERS.join(','));
  });

  it('quotes and escapes values containing commas, quotes or newlines', () => {
    const csv = glossariesToCSV([
      makeGlossary({
        sourceTerm: '慈悲',
        translations: [
          makeTranslation({
            term: 'compassion, kindness',
            sourceText: 'has "quotes"',
            targetText: 'line1\nline2',
          }),
        ],
      }),
    ]);

    const dataLine = csv.split('\n').slice(1).join('\n');
    expect(dataLine).toContain('"compassion, kindness"');
    expect(dataLine).toContain('"has ""quotes"""');
    expect(dataLine).toContain('"line1\nline2"');
  });
});

// ─── glossariesToXLSX ────────────────────────────────────────────────────────

describe('glossariesToXLSX', () => {
  it('round-trips headers and values through a real workbook', async () => {
    const bytes = await glossariesToXLSX([
      makeGlossary({
        id: 'abc',
        sourceTerm: '菩薩',
        translations: [makeTranslation({ term: 'bodhisattva', sourceName: 'Lotus', volume: '1' })],
      }),
    ]);

    const workbook = read(bytes, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const parsed = utils.sheet_to_json<Record<string, string>>(sheet, { defval: '', raw: false });

    expect(parsed).toHaveLength(1);
    expect(Object.keys(parsed[0])).toEqual([...GLOSSARY_EXPORT_HEADERS]);
    expect(parsed[0]).toMatchObject({
      UUID: 'abc',
      ChineseTerm: '菩薩',
      EnglishTerm: 'bodhisattva',
      SutraName: 'Lotus',
    });
  });

  it('produces a header-only sheet for an empty glossary', async () => {
    const bytes = await glossariesToXLSX([]);
    const workbook = read(bytes, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const aoa = utils.sheet_to_json<string[]>(sheet, { header: 1 });

    expect(aoa[0]).toEqual([...GLOSSARY_EXPORT_HEADERS]);
    expect(aoa).toHaveLength(1);
  });
});

// ─── parseExportFormat ───────────────────────────────────────────────────────

describe('parseExportFormat', () => {
  it('returns csv only for an explicit csv value', () => {
    expect(parseExportFormat('csv')).toBe('csv');
  });

  it('defaults to xlsx for xlsx, missing or unrecognised values', () => {
    expect(parseExportFormat('xlsx')).toBe('xlsx');
    expect(parseExportFormat(null)).toBe('xlsx');
    expect(parseExportFormat(undefined)).toBe('xlsx');
    expect(parseExportFormat('exe')).toBe('xlsx');
  });
});

// ─── Round trip through import (PR 6b) ───────────────────────────────────────

describe('export → import round trip', () => {
  const entries = [
    makeGlossary({
      id: 'g1',
      sourceTerm: '佛',
      phonetic: 'fó',
      translations: [
        makeTranslation({
          id: 't1',
          term: 'Buddha',
          sourceName: '華嚴經',
          volume: '3',
          sourceText: '佛告阿難',
          targetText: 'The Buddha told Ānanda, "listen"',
          author: '翻譯團隊',
          discussion: 'the standard rendering,\nkept for consistency',
        }),
        makeTranslation({ id: 't2', term: 'the Awakened One', sourceName: 'S', volume: '1', discussion: null }),
      ],
    }),
    makeGlossary({ id: 'g2', sourceTerm: '法', translations: [makeTranslation({ id: 't3', term: 'Dharma' })] }),
  ];

  // What importing the file over the same entries would do to each translation.
  const reimport = (rows: GlossaryImportRow[]) =>
    groupRows(rows).flatMap((group) => {
      const entry = entries.find((e) => e.id === group.uuid)!;
      const stored: MergeableTranslation[] = [...(entry.translations ?? [])];
      return mergeTranslationsWithStatus<MergeableTranslation>(stored, group.rows.map(translationFromRow));
    });

  it('exports each translation’s id and discussion', () => {
    expect(glossariesToExportRows(entries)[0]).toMatchObject({
      TranslationUUID: 't1',
      Discussion: 'the standard rendering,\nkept for consistency',
    });
    expect(glossariesToExportRows(entries)[1]).toMatchObject({ TranslationUUID: 't2', Discussion: '' });
  });

  it('changes nothing when a CSV export is imported back', () => {
    const merged = reimport(parseGlossaryCSV(glossariesToCSV(entries)));
    expect(merged.map((m) => m.status)).toEqual(['kept', 'kept', 'kept']);
  });

  it('changes nothing when an XLSX export is imported back', async () => {
    const file = new File([await glossariesToXLSX(entries)], 'glossary.xlsx');
    const merged = reimport(await parseGlossaryXLSX(file));
    expect(merged.map((m) => m.status)).toEqual(['kept', 'kept', 'kept']);
  });

  it('brings an edited cell back as an update of that translation, not a new one', () => {
    const csv = glossariesToCSV(entries).replace('the Awakened One', 'the Awakened');
    const merged = reimport(parseGlossaryCSV(csv));
    // groupRows orders terms by Chinese collation, so compare by translation id.
    const byId = merged
      .map((m) => [m.translation.id, m.translation.term, m.status])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    expect(byId).toEqual([
      ['t1', 'Buddha', 'kept'],
      ['t2', 'the Awakened', 'updated'],
      ['t3', 'Dharma', 'kept'],
    ]);
  });
});
