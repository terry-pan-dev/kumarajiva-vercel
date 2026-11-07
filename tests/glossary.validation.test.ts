import { describe, expect, it } from 'vitest';

import {
  glossaryEditFormSchema,
  glossaryFormSchema,
  glossaryInsertFormSchema,
} from '~/validations/glossary.validation';

// ─── glossaryFormSchema (Add New Entry) ──────────────────────────────────────

describe('glossaryFormSchema', () => {
  it('parses required fields and leaves the sutra name blank', () => {
    const result = glossaryFormSchema.parse({
      glossaryChinese: '詞彙',
      phoneticChinese: 'cí huì',
      glossary: 'vocabulary',
    });

    expect(result).toMatchObject({
      glossaryChinese: '詞彙',
      phoneticChinese: 'cí huì',
      glossary: 'vocabulary',
    });
    expect(result.sutraName).toBeUndefined();
  });

  it('parses all optional fields when provided', () => {
    const result = glossaryFormSchema.parse({
      glossaryChinese: '法',
      phoneticChinese: 'fǎ',
      sutraTextChinese: '法者，諸聖人之所趨也',
      volumeChinese: '1a',
      cbetaFrequencyChinese: '500',
      authorChinese: '鳩摩羅什',
      discussionChinese: 'discussion text',
      glossary: 'Dharma',
      sutraText: 'the dharma sutra text',
      sutraName: 'flower sutra',
      volume: '1b',
      author: 'Translation Team',
      partOfSpeech: 'noun',
      phonetic: 'dharma',
    });

    expect(result).toMatchObject({
      glossaryChinese: '法',
      phoneticChinese: 'fǎ',
      sutraTextChinese: '法者，諸聖人之所趨也',
      volumeChinese: '1a',
      cbetaFrequencyChinese: '500',
      authorChinese: '鳩摩羅什',
      discussionChinese: 'discussion text',
      glossary: 'Dharma',
      sutraText: 'the dharma sutra text',
      sutraName: 'flower sutra',
      volume: '1b',
      author: 'Translation Team',
      partOfSpeech: 'noun',
      phonetic: 'dharma',
    });
  });
});

// ─── glossaryInsertFormSchema (Add New Translation) ──────────────────────────

describe('glossaryInsertFormSchema', () => {
  it('stores blank source, section and author as blank, with no placeholder', () => {
    const result = glossaryInsertFormSchema.parse({
      id: 'glossary-uuid-123',
      term: 'vocabulary',
      language: 'english',
      sourceName: '',
      volume: '',
      author: '',
    });

    expect(result).toMatchObject({
      id: 'glossary-uuid-123',
      term: 'vocabulary',
      language: 'english',
      sourceName: '',
      volume: '',
      author: '',
    });
  });

  it('parses all fields when provided', () => {
    const result = glossaryInsertFormSchema.parse({
      id: 'glossary-uuid-456',
      term: 'impermanence',
      language: 'english',
      sourceName: 'Diamond Sutra',
      volume: '2a',
      sourceText: '無常',
      targetText: 'all things are impermanent',
      author: 'Translation Team',
      partOfSpeech: 'noun',
      phonetic: 'impermanence',
    });

    expect(result).toMatchObject({
      id: 'glossary-uuid-456',
      term: 'impermanence',
      language: 'english',
      sourceName: 'Diamond Sutra',
      volume: '2a',
      sourceText: '無常',
      targetText: 'all things are impermanent',
      author: 'Translation Team',
      partOfSpeech: 'noun',
      phonetic: 'impermanence',
    });
  });
});

// ─── glossaryEditFormSchema (Update Glossary Entry) ──────────────────────────

describe('glossaryEditFormSchema', () => {
  it('parses a glossary entry with one translation', () => {
    const result = glossaryEditFormSchema.parse({
      id: 'glossary-uuid-789',
      glossary: '般若',
      phonetic: 'bō rě',
      author: 'Translation Team',
      cbetaFrequency: '1200',
      discussion: 'a key Buddhist concept',
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
    expect(result.glossary).toBe('般若');
    expect(result.phonetic).toBe('bō rě');
    expect(result.author).toBe('Translation Team');
    expect(result.cbetaFrequency).toBe('1200');
    expect(result.discussion).toBe('a key Buddhist concept');

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
      glossary: '法',
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

    expect(result.author).toBeUndefined();
    expect(result.cbetaFrequency).toBeUndefined();
    expect(result.discussion).toBeUndefined();

    const [translation] = result.translations;
    expect(translation.sourceText).toBeUndefined();
    expect(translation.targetText).toBeUndefined();
    expect(translation.partOfSpeech).toBeUndefined();
    expect(translation.phonetic).toBeUndefined();
  });

  // Without it a save would replace every translation, giving each a new id.
  const withTranslation = (extra: object) => ({
    id: 'glossary-uuid-000',
    glossary: '法',
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
});

// ─── Field names before PR 8a ────────────────────────────────────────────────
// A page loaded before the rename deploy posts sutraName / originSutraText / targetSutraText.
// It must be refused, not saved without the fields it names the old way.

describe('a form posting the old field names', () => {
  const old = { sutraName: 'Heart Sutra', originSutraText: '觀自在菩薩', targetSutraText: 'Avalokitesvara' };

  it('is refused by the edit form', () => {
    const result = glossaryEditFormSchema.safeParse({
      id: 'glossary-uuid-000',
      glossary: '法',
      phonetic: 'fǎ',
      translations: [{ term: 'dharma', language: 'english', volume: '-', ...old }],
    });
    expect(result.success).toBe(false);
  });

  it('is refused by the insert form', () => {
    const result = glossaryInsertFormSchema.safeParse({ id: 'g1', term: 'Dharma', volume: '', author: '', ...old });
    expect(result.success).toBe(false);
  });
});

// ─── Field name before PR 8b ─────────────────────────────────────────────────
// A page loaded before that deploy posts the rendering as `glossary`, not `term`. It must be
// refused, not saved without its rendering. (The edit form's own `glossary`, the headword, is
// unchanged.)

describe('a form posting the rendering as glossary', () => {
  it('is refused by the edit form', () => {
    const result = glossaryEditFormSchema.safeParse({
      id: 'glossary-uuid-000',
      glossary: '法',
      phonetic: 'fǎ',
      translations: [{ glossary: 'dharma', language: 'english', sourceName: '佛教常用詞', volume: '-' }],
    });
    expect(result.success).toBe(false);
  });

  it('is refused by the insert form', () => {
    const result = glossaryInsertFormSchema.safeParse({
      id: 'g1',
      glossary: 'Dharma',
      sourceName: '',
      volume: '',
      author: '',
    });
    expect(result.success).toBe(false);
  });
});

// ─── Translation language (no longer the user's target language) ────────────

describe('glossary translation language', () => {
  const entry = { glossaryChinese: '法', phoneticChinese: 'fǎ', glossary: 'Dharma' };
  const insert = { id: 'g1', term: 'Dharma', sourceName: '', volume: '', author: '' };

  it('a new entry is in English unless another language is chosen', () => {
    expect(glossaryFormSchema.parse(entry).language).toBe('english');
    expect(glossaryFormSchema.parse({ ...entry, language: 'indonesian' }).language).toBe('indonesian');
  });

  it('a new translation of an existing entry defaults to English too', () => {
    expect(glossaryInsertFormSchema.parse(insert).language).toBe('english');
    expect(glossaryInsertFormSchema.parse({ ...insert, language: 'sanskrit' }).language).toBe('sanskrit');
  });

  // Entries are Chinese terms; a "translation" into Chinese is not one.
  it('refuses Chinese and unknown languages for a translation', () => {
    expect(glossaryFormSchema.safeParse({ ...entry, language: 'chinese' }).success).toBe(false);
    expect(glossaryFormSchema.safeParse({ ...entry, language: 'french' }).success).toBe(false);
    expect(glossaryInsertFormSchema.safeParse({ ...insert, language: 'chinese' }).success).toBe(false);
  });
});

// ─── Rationale, the same rule in every form ──────────────────────────────────

describe('rationale', () => {
  const create = (rationale?: unknown) =>
    glossaryFormSchema.safeParse({ glossaryChinese: '法', phoneticChinese: 'fǎ', glossary: 'Dharma', rationale });
  const insert = (rationale?: unknown) =>
    glossaryInsertFormSchema.safeParse({
      id: 'g1',
      term: 'Dharma',
      sourceName: '',
      volume: '',
      author: '',
      rationale,
    });
  const edit = (rationale?: unknown) =>
    glossaryEditFormSchema.safeParse({
      id: 'g1',
      glossary: '法',
      phonetic: 'fǎ',
      translations: [{ term: 'Dharma', language: 'english', sourceName: '佛教常用詞', volume: '-', rationale }],
    });
  const rationaleOf = {
    create: (value?: unknown) => {
      const r = create(value);
      return r.success ? r.data.rationale : 'invalid';
    },
    insert: (value?: unknown) => {
      const r = insert(value);
      return r.success ? r.data.rationale : 'invalid';
    },
    edit: (value?: unknown) => {
      const r = edit(value);
      return r.success ? r.data.translations[0].rationale : 'invalid';
    },
  };

  it.each(['create', 'insert', 'edit'] as const)('%s keeps a rationale, trimmed', (form) => {
    expect(rationaleOf[form]('  chosen over “law”: the term is technical here \n')).toBe(
      'chosen over “law”: the term is technical here',
    );
  });

  // Blank and absent mean the same, so clearing the field never reads as an edit of it.
  it.each(['create', 'insert', 'edit'] as const)('%s stores blank or absent as null', (form) => {
    expect(rationaleOf[form]('   ')).toBeNull();
    expect(rationaleOf[form]('')).toBeNull();
    expect(rationaleOf[form](null)).toBeNull();
    expect(rationaleOf[form](undefined)).toBeNull();
  });

  it.each(['create', 'insert', 'edit'] as const)('%s accepts a long rationale', (form) => {
    expect(rationaleOf[form]('x'.repeat(20_000))).toHaveLength(20_000);
  });
});
