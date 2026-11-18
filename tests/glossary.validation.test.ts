import { describe, expect, it } from 'vitest';

import { glossaryEditFormSchema } from '~/validations/glossary.validation';

// ─── glossaryEditFormSchema (the Data Management entry editor) ───────────────

describe('glossaryEditFormSchema', () => {
  it('parses a glossary entry with one translation', () => {
    const result = glossaryEditFormSchema.parse({
      id: 'glossary-uuid-789',
      sourceTerm: '般若',
      phonetic: 'bō rě',
      cbetaFrequency: '1200',
      translations: [
        {
          term: 'prajna',
          language: 'english',
          sourceName: 'Heart Sutra',
          volume: '1a',
          sourceText: '觀自在菩薩',
          targetText: 'Avalokitesvara Bodhisattva',
          author: 'Translation Team',
          updatedAt: '2024-01-01T00:00:00.000Z',
          partOfSpeech: 'noun',
          phonetic: 'prajna',
        },
      ],
    });

    expect(result.id).toBe('glossary-uuid-789');
    expect(result.sourceTerm).toBe('般若');
    expect(result.phonetic).toBe('bō rě');
    expect(result.cbetaFrequency).toBe('1200');

    expect(result.translations).toHaveLength(1);
    const [translation] = result.translations;
    expect(translation).toMatchObject({
      term: 'prajna',
      language: 'english',
      sourceName: 'Heart Sutra',
      volume: '1a',
      sourceText: '觀自在菩薩',
      targetText: 'Avalokitesvara Bodhisattva',
      author: 'Translation Team',
      partOfSpeech: 'noun',
      phonetic: 'prajna',
    });
  });

  it('parses nullable optional fields as null when omitted', () => {
    const result = glossaryEditFormSchema.parse({
      id: 'glossary-uuid-000',
      sourceTerm: '法',
      phonetic: 'fǎ',
      translations: [
        {
          term: 'dharma',
          language: 'english',
          sourceName: '佛教常用詞',
          volume: '-',
        },
      ],
    });

    expect(result.cbetaFrequency).toBeUndefined();

    const [translation] = result.translations;
    expect(translation.sourceText).toBeUndefined();
    expect(translation.targetText).toBeUndefined();
    expect(translation.partOfSpeech).toBeUndefined();
    expect(translation.phonetic).toBeUndefined();
  });

  // Without it a save would replace every translation, giving each a new id.
  const withTranslation = (extra: object) => ({
    id: 'glossary-uuid-000',
    sourceTerm: '法',
    phonetic: 'fǎ',
    translations: [{ term: 'dharma', language: 'english', sourceName: '佛教常用詞', volume: '-', ...extra }],
  });

  it('keeps each translation’s id', () => {
    const id = '0000fe57-0000-4000-8000-000000000001';
    expect(glossaryEditFormSchema.parse(withTranslation({ id })).translations[0].id).toBe(id);
  });

  it('accepts a translation without an id', () => {
    expect(glossaryEditFormSchema.parse(withTranslation({})).translations[0].id).toBeUndefined();
  });

  it('keeps the ids the form was opened with', () => {
    const ids = ['0000fe57-0000-4000-8000-000000000001'];
    expect(
      glossaryEditFormSchema.parse({ ...withTranslation({}), baseTranslationIds: ids }).baseTranslationIds,
    ).toEqual(ids);
    expect(glossaryEditFormSchema.parse(withTranslation({})).baseTranslationIds).toBeUndefined();
  });

  it('refuses a translation id that is not a uuid', () => {
    expect(glossaryEditFormSchema.safeParse(withTranslation({ id: 'not-a-uuid' })).success).toBe(false);
  });

  it('refuses a blank translation term', () => {
    expect(glossaryEditFormSchema.safeParse(withTranslation({ term: ' ' })).success).toBe(false);
  });

  // Who created the entry, and a column that is only ever blank: neither is edited here.
  it('drops a term author or discussion a page still posts', () => {
    const result = glossaryEditFormSchema.parse({ ...withTranslation({}), author: 'someone', discussion: 'x' });
    expect(result).not.toHaveProperty('author');
    expect(result).not.toHaveProperty('discussion');
  });

  // A stored translation keeps its language; one added in the form needs a translation language.
  it('refuses Chinese for an added translation but not a stored one', () => {
    const id = '0000fe57-0000-4000-8000-000000000001';
    expect(glossaryEditFormSchema.safeParse(withTranslation({ language: 'chinese' })).success).toBe(false);
    expect(glossaryEditFormSchema.safeParse(withTranslation({ id, language: 'chinese' })).success).toBe(true);
  });
});

// ─── Field names before PR 8a ────────────────────────────────────────────────
// A page loaded before the rename deploy posts sutraName / originSutraText / targetSutraText.
// It must be refused, not saved without the fields it names the old way.

describe('a form posting the old field names', () => {
  const old = { sutraName: 'Heart Sutra', originSutraText: '觀自在菩薩', targetSutraText: 'Avalokitesvara' };

  it('is refused by the edit form', () => {
    const result = glossaryEditFormSchema.safeParse({
      id: 'glossary-uuid-000',
      sourceTerm: '法',
      phonetic: 'fǎ',
      translations: [{ term: 'dharma', language: 'english', volume: '-', ...old }],
    });
    expect(result.success).toBe(false);
  });
});

// ─── Field name before PR 8b ─────────────────────────────────────────────────
// A page loaded before that deploy posts the rendering as `glossary`, not `term`. It must be
// refused, not saved without its rendering. (The headword was still `glossary` then; it became
// `sourceTerm` in PR 11.)

describe('a form posting the rendering as glossary', () => {
  it('is refused by the edit form', () => {
    const result = glossaryEditFormSchema.safeParse({
      id: 'glossary-uuid-000',
      sourceTerm: '法',
      phonetic: 'fǎ',
      translations: [{ glossary: 'dharma', language: 'english', sourceName: '佛教常用詞', volume: '-' }],
    });
    expect(result.success).toBe(false);
  });
});

// ─── Field name before PR 11 ─────────────────────────────────────────────────
// A page loaded before that deploy posts the headword as `glossary`, not `sourceTerm`. The edit
// form refuses it (reload and redo) rather than accepting a save without its headword.

describe('an edit form posting the headword as glossary', () => {
  it('is refused', () => {
    const result = glossaryEditFormSchema.safeParse({
      id: 'glossary-uuid-000',
      glossary: '法',
      phonetic: 'fǎ',
      translations: [{ term: 'dharma', language: 'english', sourceName: '', volume: '' }],
    });
    expect(result.success).toBe(false);
  });

  it('is accepted under the new name', () => {
    const result = glossaryEditFormSchema.safeParse({
      id: 'glossary-uuid-000',
      sourceTerm: '法',
      phonetic: 'fǎ',
      translations: [{ term: 'dharma', language: 'english', sourceName: '', volume: '' }],
    });
    expect(result.success).toBe(true);
  });
});

// ─── Discussion ──────────────────────────────────────────────────────────────

describe('discussion', () => {
  const translation = (discussion?: unknown) => ({ term: 'Dharma', sourceName: '', volume: '', discussion });
  const edit = (discussion?: unknown) =>
    glossaryEditFormSchema.safeParse({
      id: 'g1',
      sourceTerm: '法',
      phonetic: 'fǎ',
      translations: [{ ...translation(discussion), language: 'english' }],
    });
  const discussionOf = {
    edit: (value?: unknown) => {
      const r = edit(value);
      return r.success ? r.data.translations[0].discussion : 'invalid';
    },
  };

  it.each(['edit'] as const)('%s keeps a discussion, trimmed', (form) => {
    expect(discussionOf[form]('  chosen over “law”: the term is technical here \n')).toBe(
      'chosen over “law”: the term is technical here',
    );
  });

  // Blank and absent mean the same, so clearing the field never reads as an edit of it.
  it.each(['edit'] as const)('%s stores blank or absent as null', (form) => {
    expect(discussionOf[form]('   ')).toBeNull();
    expect(discussionOf[form]('')).toBeNull();
    expect(discussionOf[form](null)).toBeNull();
    expect(discussionOf[form](undefined)).toBeNull();
  });

  it.each(['edit'] as const)('%s accepts a long discussion', (form) => {
    expect(discussionOf[form]('x'.repeat(20_000))).toHaveLength(20_000);
  });
});
