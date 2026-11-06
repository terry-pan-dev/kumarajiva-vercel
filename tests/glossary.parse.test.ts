import { describe, expect, it } from 'vitest';

import {
  chunkGroupsToRows,
  CHUNK_SIZE,
  groupRows,
  parseGlossaryCSV,
  parseGlossaryXLSX,
  translationFromRow,
  type GlossaryImportRow,
} from '~/services/glossary.parse';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<GlossaryImportRow> & { chineseTerm: string }): GlossaryImportRow {
  return {
    uuid: '',
    englishTerm: '',
    chineseSutraText: '',
    englishSutraText: '',
    sutraName: '',
    volume: '',
    cbetaFrequency: '',
    author: '',
    phonetic: '',
    ...overrides,
  };
}

// ─── groupRows ───────────────────────────────────────────────────────────────

describe('groupRows', () => {
  it('merges rows sharing a term into one group with a translation each', () => {
    const groups = groupRows([
      makeRow({ chineseTerm: '菩薩', englishTerm: 'bodhisattva' }),
      makeRow({ chineseTerm: '菩薩', englishTerm: 'enlightened being' }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('菩薩');
    expect(groups[0].rows).toHaveLength(2);
  });

  // The database permits one row per term (unique_glossary_idx), so a UUID-bearing row and a
  // bare row for the same term must not become two groups — they could never both be written.
  it('groups a UUID row and a bare row for the same term together', () => {
    const groups = groupRows([
      makeRow({ chineseTerm: '菩薩', englishTerm: 'bodhisattva', uuid: 'abc-123' }),
      makeRow({ chineseTerm: '菩薩', englishTerm: 'enlightened being' }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].uuid).toBe('abc-123');
    expect(groups[0].uuidConflict).toBe(false);
  });

  it('carries the UUID even when it appears only on a later row', () => {
    const groups = groupRows([
      makeRow({ chineseTerm: '法', englishTerm: 'dharma' }),
      makeRow({ chineseTerm: '法', englishTerm: 'law', uuid: 'def-456' }),
    ]);

    expect(groups[0].uuid).toBe('def-456');
    expect(groups[0].uuidConflict).toBe(false);
  });

  it('flags a conflict and keeps the first UUID when rows disagree', () => {
    const groups = groupRows([
      makeRow({ chineseTerm: '法', englishTerm: 'dharma', uuid: 'first-id' }),
      makeRow({ chineseTerm: '法', englishTerm: 'law', uuid: 'second-id' }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].uuid).toBe('first-id');
    expect(groups[0].uuidConflict).toBe(true);
  });

  it('leaves uuid empty when the file supplies none', () => {
    const groups = groupRows([makeRow({ chineseTerm: '空', englishTerm: 'emptiness' })]);

    expect(groups[0].uuid).toBe('');
    expect(groups[0].uuidConflict).toBe(false);
  });

  it('keeps distinct terms in separate groups', () => {
    const groups = groupRows([
      makeRow({ chineseTerm: '菩薩', englishTerm: 'bodhisattva' }),
      makeRow({ chineseTerm: '法', englishTerm: 'dharma' }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.key).sort()).toEqual(['法', '菩薩'].sort());
  });

  it('orders groups deterministically regardless of row order', () => {
    const rows = [makeRow({ chineseTerm: '空' }), makeRow({ chineseTerm: '菩薩' }), makeRow({ chineseTerm: '法' })];

    const forward = groupRows(rows).map((g) => g.key);
    const reversed = groupRows([...rows].reverse()).map((g) => g.key);

    expect(forward).toEqual(reversed);
  });

  it('returns no groups for no rows', () => {
    expect(groupRows([])).toEqual([]);
  });
});

// ─── chunkGroupsToRows ───────────────────────────────────────────────────────

describe('chunkGroupsToRows', () => {
  it('keeps every row of a term inside a single chunk', () => {
    // One term with more rows than a chunk holds: it must still not be split.
    const rows = Array.from({ length: CHUNK_SIZE + 5 }, (_, i) =>
      makeRow({ chineseTerm: '菩薩', englishTerm: `translation ${i}` }),
    );

    const chunks = chunkGroupsToRows(groupRows(rows));

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(CHUNK_SIZE + 5);
  });

  it('splits on group boundaries, not row boundaries', () => {
    const rows = Array.from({ length: CHUNK_SIZE + 1 }, (_, i) => makeRow({ chineseTerm: `term-${i}` }));

    const chunks = chunkGroupsToRows(groupRows(rows));

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(CHUNK_SIZE);
    expect(chunks[1]).toHaveLength(1);
  });

  it('preserves every row across chunks', () => {
    const rows = Array.from({ length: 40 }, (_, i) => makeRow({ chineseTerm: `term-${i}`, englishTerm: `en-${i}` }));

    const chunks = chunkGroupsToRows(groupRows(rows));

    expect(chunks.flat()).toHaveLength(40);
    expect(new Set(chunks.flat().map((r) => r.chineseTerm)).size).toBe(40);
  });

  it('returns no chunks for no groups', () => {
    expect(chunkGroupsToRows([])).toEqual([]);
  });
});

// ─── The optional columns (PR 6b) ────────────────────────────────────────────

describe('parseGlossaryCSV — TranslationUUID and Rationale', () => {
  const header =
    'UUID,ChineseTerm,EnglishTerm,ChineseSutraText,EnglishSutraText,SutraName,Volume,CBetaFrequency,Author,Phonetic';

  it('reads both columns, trimmed', () => {
    const [row] = parseGlossaryCSV(`${header},TranslationUUID,Rationale\ng1,法,Dharma,,,S,1,,,fǎ, t1 , why \n`);
    expect(row).toMatchObject({ translationUuid: 't1', rationale: 'why' });
  });

  it('leaves them out for a file without those columns, so stored rationales stay', () => {
    const [row] = parseGlossaryCSV(`${header}\ng1,法,Dharma,,,S,1,,,fǎ\n`);
    expect(row).not.toHaveProperty('translationUuid');
    expect(row).not.toHaveProperty('rationale');
  });

  it('reads a blank cell as empty, not absent', () => {
    const [row] = parseGlossaryCSV(`${header},TranslationUUID,Rationale\ng1,法,Dharma,,,S,1,,,fǎ,,\n`);
    expect(row).toMatchObject({ translationUuid: '', rationale: '' });
  });
});

describe('parseGlossaryXLSX — TranslationUUID and Rationale', () => {
  const xlsxFile = async (aoa: string[][]) => {
    const { utils, write } = await import('xlsx');
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, utils.aoa_to_sheet(aoa), 'Glossary');
    return new File([write(workbook, { type: 'array', bookType: 'xlsx' })], 'glossary.xlsx');
  };

  it('reads both columns, under either header spelling', async () => {
    const [row] = await parseGlossaryXLSX(
      await xlsxFile([
        ['ChineseTerm', 'EnglishTerm', 'Translation UUID', 'rationale'],
        ['法', 'Dharma', 't1', 'why'],
      ]),
    );
    expect(row).toMatchObject({ translationUuid: 't1', rationale: 'why' });
  });

  it('leaves them out for a file without those columns', async () => {
    const [row] = await parseGlossaryXLSX(
      await xlsxFile([
        ['ChineseTerm', 'EnglishTerm'],
        ['法', 'Dharma'],
      ]),
    );
    expect(row).not.toHaveProperty('translationUuid');
    expect(row).not.toHaveProperty('rationale');
  });
});

describe('translationFromRow', () => {
  it('reads a row as the translation it describes', () => {
    expect(
      translationFromRow(
        makeRow({
          chineseTerm: '法',
          englishTerm: 'Dharma',
          sutraName: 'S',
          volume: '1',
          chineseSutraText: '法',
          translationUuid: 't1',
          rationale: 'why',
        }),
      ),
    ).toEqual({
      id: 't1',
      glossary: 'Dharma',
      sutraName: 'S',
      volume: '1',
      originSutraText: '法',
      targetSutraText: null,
      author: null,
      rationale: 'why',
    });
  });

  it('gives no id for a blank TranslationUUID, null for a blank rationale and undefined for none', () => {
    const blank = translationFromRow(makeRow({ chineseTerm: '法', translationUuid: '', rationale: '' }));
    expect(blank.id).toBeUndefined();
    expect(blank.rationale).toBeNull();
    expect(translationFromRow(makeRow({ chineseTerm: '法' })).rationale).toBeUndefined();
  });
});
