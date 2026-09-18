import { describe, expect, it } from 'vitest';

import { type ReadGlossary } from '~/drizzle/tables';
import { glossaryIndexRecord, searchablePhonetic } from '~/services/glossary.record';

type StoredTranslation = NonNullable<ReadGlossary['translations']>[number];

function makeTranslation(overrides: Partial<StoredTranslation> & { glossary: string }): StoredTranslation {
  return {
    language: 'english',
    sutraName: '佛教常用詞',
    volume: '-',
    updatedBy: 'user-1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('searchablePhonetic', () => {
  it('strips diacritics so an unaccented search matches an accented phonetic', () => {
    expect(searchablePhonetic('dhárma')).toBe('dharma');
  });

  it('leaves a phonetic with no diacritics alone', () => {
    expect(searchablePhonetic('dharma')).toBe('dharma');
  });

  // Every combining mark goes, including the tilde on ñ and the macrons on long vowels, so a
  // reader who types romanised Sanskrit without any of them still finds the entry.
  it('strips every mark used in romanised Sanskrit, the tilde included', () => {
    expect(searchablePhonetic('prajñāpāramitā')).toBe('prajnaparamita');
  });

  it('returns null for an absent or empty phonetic', () => {
    expect(searchablePhonetic(null)).toBeNull();
    expect(searchablePhonetic(undefined)).toBeNull();
    expect(searchablePhonetic('')).toBeNull();
  });
});

describe('glossaryIndexRecord', () => {
  const row = {
    id: '0b3f1c2d-0000-4000-8000-000000000001',
    glossary: '法',
    phonetic: 'dhárma',
    translations: [makeTranslation({ glossary: 'dharma', originSutraText: '諸法', targetSutraText: 'all dharmas' })],
  };

  it('keys the record on the row uuid, so re-indexing overwrites rather than duplicates', () => {
    const record = glossaryIndexRecord(row);

    expect(record.objectID).toBe(row.id);
    expect(record.id).toBe(row.id);
  });

  it('indexes the normalised phonetic, not the stored one', () => {
    expect(glossaryIndexRecord(row).phonetic).toBe('dharma');
  });

  it('carries only the searchable part of a translation', () => {
    // The sutra citations stay out of the index: a hit resolves back to the row, which has them.
    expect(glossaryIndexRecord(row).translations).toEqual([{ glossary: 'dharma', language: 'english' }]);
  });

  it('survives a row with no translations', () => {
    expect(glossaryIndexRecord({ ...row, translations: null }).translations).toBeUndefined();
  });

  // Re-indexing writes whole records, so a cleared phonetic has to travel as an explicit null
  // rather than a missing key, or the old value would survive in the record.
  it('writes an explicit null for a cleared phonetic', () => {
    expect(glossaryIndexRecord({ ...row, phonetic: null })).toHaveProperty('phonetic', null);
  });
});
