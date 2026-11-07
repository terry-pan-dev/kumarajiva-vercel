import { describe, expect, it } from 'vitest';

import { glossaryCreateFormSchema, glossaryEditFormSchema } from '~/validations/glossary.validation';

// ─── glossaryCreateFormSchema (Add New Entry) ────────────────────────────────

describe('glossaryCreateFormSchema', () => {
  const entry = (translation: object = {}, fields: object = {}) => ({
    sourceTerm: '詞彙',
    phonetic: 'cí huì',
    translations: [{ term: 'vocabulary', sourceName: '', volume: '', ...translation }],
    ...fields,
  });

  it('needs only the term, its phonetic and a translation term', () => {
    const result = glossaryCreateFormSchema.parse(entry());
    expect(result).toMatchObject({
      sourceTerm: '詞彙',
      phonetic: 'cí huì',
      translations: [{ term: 'vocabulary', language: 'english', sourceName: '', volume: '' }],
    });
    expect(result.cbetaFrequency).toBeUndefined();
  });

  it('parses all fields when provided', () => {
    const translation = {
      term: 'Dharma',
      language: 'sanskrit',
      phonetic: 'dharma',
      sourceName: 'flower sutra',
      author: 'Kumārajīva',
      volume: '1b',
      partOfSpeech: 'noun',
      sourceText: '法者，諸聖人之所趨也',
      targetText: 'the dharma sutra text',
      discussion: 'technical sense',
    };
    expect(glossaryCreateFormSchema.parse(entry(translation, { cbetaFrequency: '500' }))).toMatchObject({
      cbetaFrequency: '500',
      translations: [translation],
    });
  });

  it('refuses an entry without a translation, or with a blank translation term', () => {
    expect(glossaryCreateFormSchema.safeParse(entry({}, { translations: [] })).success).toBe(false);
    expect(glossaryCreateFormSchema.safeParse(entry({ term: '  ' })).success).toBe(false);
  });

  it('refuses a term that is not Chinese', () => {
    expect(glossaryCreateFormSchema.safeParse(entry({}, { sourceTerm: 'dharma' })).success).toBe(false);
  });

  // The term's author is set from the user, not taken from the form.
  it('drops a term author or discussion a page still posts', () => {
    const result = glossaryCreateFormSchema.parse(entry({}, { author: 'someone', discussion: 'x' }));
    expect(result).not.toHaveProperty('author');
    expect(result).not.toHaveProperty('discussion');
  });
});

// ─── glossaryEditFormSchema (Update Glossary Entry) ──────────────────────────

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

  it('is refused by the create form', () => {
    const result = glossaryCreateFormSchema.safeParse({
      sourceTerm: '法',
      phonetic: 'fǎ',
      translations: [{ term: 'Dharma', volume: '', ...old }],
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

  it('is refused by the create form', () => {
    const result = glossaryCreateFormSchema.safeParse({
      sourceTerm: '法',
      phonetic: 'fǎ',
      translations: [{ glossary: 'Dharma', sourceName: '', volume: '' }],
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

// ─── Translation language (no longer the user's target language) ────────────

describe('glossary translation language', () => {
  const entry = (language?: string) => ({
    sourceTerm: '法',
    phonetic: 'fǎ',
    translations: [{ term: 'Dharma', sourceName: '', volume: '', ...(language && { language }) }],
  });
  const languageOf = (language?: string) => glossaryCreateFormSchema.parse(entry(language)).translations[0].language;

  it('a new translation is in English unless another language is chosen', () => {
    expect(languageOf()).toBe('english');
    expect(languageOf('indonesian')).toBe('indonesian');
  });

  // Entries are Chinese terms; a "translation" into Chinese is not one.
  it('refuses Chinese and unknown languages for a translation', () => {
    expect(glossaryCreateFormSchema.safeParse(entry('chinese')).success).toBe(false);
    expect(glossaryCreateFormSchema.safeParse(entry('french')).success).toBe(false);
  });
});

// ─── Discussion, the same rule in every form ──────────────────────────────────

describe('discussion', () => {
  const translation = (discussion?: unknown) => ({ term: 'Dharma', sourceName: '', volume: '', discussion });
  const create = (discussion?: unknown) =>
    glossaryCreateFormSchema.safeParse({ sourceTerm: '法', phonetic: 'fǎ', translations: [translation(discussion)] });
  const edit = (discussion?: unknown) =>
    glossaryEditFormSchema.safeParse({
      id: 'g1',
      sourceTerm: '法',
      phonetic: 'fǎ',
      translations: [{ ...translation(discussion), language: 'english' }],
    });
  const discussionOf = {
    create: (value?: unknown) => {
      const r = create(value);
      return r.success ? r.data.translations[0].discussion : 'invalid';
    },
    edit: (value?: unknown) => {
      const r = edit(value);
      return r.success ? r.data.translations[0].discussion : 'invalid';
    },
  };

  it.each(['create', 'edit'] as const)('%s keeps a discussion, trimmed', (form) => {
    expect(discussionOf[form]('  chosen over “law”: the term is technical here \n')).toBe(
      'chosen over “law”: the term is technical here',
    );
  });

  // Blank and absent mean the same, so clearing the field never reads as an edit of it.
  it.each(['create', 'edit'] as const)('%s stores blank or absent as null', (form) => {
    expect(discussionOf[form]('   ')).toBeNull();
    expect(discussionOf[form]('')).toBeNull();
    expect(discussionOf[form](null)).toBeNull();
    expect(discussionOf[form](undefined)).toBeNull();
  });

  it.each(['create', 'edit'] as const)('%s accepts a long discussion', (form) => {
    expect(discussionOf[form]('x'.repeat(20_000))).toHaveLength(20_000);
  });
});
