import { describe, expect, it } from 'vitest';

import {
  glossaryEditFormSchema,
  glossaryFormSchema,
  glossaryInsertFormSchema,
} from '~/validations/glossary.validation';

// ─── glossaryFormSchema (Add New Entry) ──────────────────────────────────────

describe('glossaryFormSchema', () => {
  it('parses required fields and applies sutraName default', () => {
    const result = glossaryFormSchema.parse({
      glossaryChinese: '詞彙',
      phoneticChinese: 'cí huì',
      glossary: 'vocabulary',
    });

    expect(result).toMatchObject({
      glossaryChinese: '詞彙',
      phoneticChinese: 'cí huì',
      glossary: 'vocabulary',
      sutraName: '佛教常用詞',
    });
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
  it('parses required fields and applies defaults for blank optional strings', () => {
    const result = glossaryInsertFormSchema.parse({
      id: 'glossary-uuid-123',
      glossary: 'vocabulary',
      language: 'english',
      sutraName: '',
      volume: '',
      author: '',
    });

    expect(result).toMatchObject({
      id: 'glossary-uuid-123',
      glossary: 'vocabulary',
      language: 'english',
      sutraName: '佛教常用詞',
      volume: '-',
      author: '翻譯團隊',
    });
  });

  it('parses all fields when provided', () => {
    const result = glossaryInsertFormSchema.parse({
      id: 'glossary-uuid-456',
      glossary: 'impermanence',
      language: 'english',
      sutraName: 'Diamond Sutra',
      volume: '2a',
      originSutraText: '無常',
      targetSutraText: 'all things are impermanent',
      author: 'Translation Team',
      partOfSpeech: 'noun',
      phonetic: 'impermanence',
    });

    expect(result).toMatchObject({
      id: 'glossary-uuid-456',
      glossary: 'impermanence',
      language: 'english',
      sutraName: 'Diamond Sutra',
      volume: '2a',
      originSutraText: '無常',
      targetSutraText: 'all things are impermanent',
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
          glossary: 'prajna',
          language: 'english',
          sutraName: 'Heart Sutra',
          volume: '1a',
          originSutraText: '觀自在菩薩',
          targetSutraText: 'Avalokitesvara Bodhisattva',
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
      glossary: 'prajna',
      language: 'english',
      sutraName: 'Heart Sutra',
      volume: '1a',
      originSutraText: '觀自在菩薩',
      targetSutraText: 'Avalokitesvara Bodhisattva',
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
          glossary: 'dharma',
          language: 'english',
          sutraName: '佛教常用詞',
          volume: '-',
        },
      ],
    });

    expect(result.author).toBeUndefined();
    expect(result.cbetaFrequency).toBeUndefined();
    expect(result.discussion).toBeUndefined();

    const [translation] = result.translations;
    expect(translation.originSutraText).toBeUndefined();
    expect(translation.targetSutraText).toBeUndefined();
    expect(translation.partOfSpeech).toBeUndefined();
    expect(translation.phonetic).toBeUndefined();
  });

  // Without it a save would replace every translation, giving each a new id.
  const withTranslation = (extra: object) => ({
    id: 'glossary-uuid-000',
    glossary: '法',
    phonetic: 'fǎ',
    translations: [{ glossary: 'dharma', language: 'english', sutraName: '佛教常用詞', volume: '-', ...extra }],
  });

  it('keeps each translation’s id', () => {
    const id = '0000fe57-0000-4000-8000-000000000001';
    expect(glossaryEditFormSchema.parse(withTranslation({ id })).translations[0].id).toBe(id);
  });

  it('accepts a translation without an id', () => {
    expect(glossaryEditFormSchema.parse(withTranslation({})).translations[0].id).toBeUndefined();
  });

  it('refuses a translation id that is not a uuid', () => {
    expect(glossaryEditFormSchema.safeParse(withTranslation({ id: 'not-a-uuid' })).success).toBe(false);
  });
});

// ─── Translation language (no longer the user's target language) ────────────

describe('glossary translation language', () => {
  const entry = { glossaryChinese: '法', phoneticChinese: 'fǎ', glossary: 'Dharma' };
  const insert = { id: 'g1', glossary: 'Dharma', sutraName: '', volume: '', author: '' };

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
