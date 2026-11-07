import { describe, expect, it } from 'vitest';

import { entryFromCreateForm } from '~/services/glossary.create';
import { glossaryCreateFormSchema } from '~/validations/glossary.validation';

const user = { id: 'user-1', username: 'Ānanda' };
const at = { id: 'new-id', now: new Date('2026-11-06T00:00:00.000Z') };
const blank = { sourceName: '', volume: '' };
const form = (fields: Record<string, unknown> = {}, translation: Record<string, unknown> = {}) =>
  glossaryCreateFormSchema.parse({
    sourceTerm: '法',
    phonetic: 'fǎ',
    translations: [{ term: 'Dharma', ...blank, ...translation }],
    ...fields,
  });

describe('entryFromCreateForm', () => {
  it('keeps each translation’s origin and target passages', () => {
    const {
      translations: [translation],
    } = entryFromCreateForm(form({}, { sourceText: '佛告阿難', targetText: 'The Buddha told Ānanda' }), user, at);
    expect(translation.sourceText).toBe('佛告阿難');
    expect(translation.targetText).toBe('The Buddha told Ānanda');
  });

  it('leaves a passage empty when only the other one is given', () => {
    const {
      translations: [translation],
    } = entryFromCreateForm(form({}, { targetText: 'The Buddha told Ānanda' }), user, at);
    expect(translation.sourceText).toBe('');
    expect(translation.targetText).toBe('The Buddha told Ānanda');
  });

  it('carries the discussion, and null when none is given', () => {
    expect(entryFromCreateForm(form({}, { discussion: 'technical sense' }), user, at).translations[0].discussion).toBe(
      'technical sense',
    );
    expect(entryFromCreateForm(form(), user, at).translations[0].discussion).toBeNull();
  });

  // The term's author records who created the entry; the form does not ask for it.
  it('builds the term, credited to the user', () => {
    const { term } = entryFromCreateForm(form({ cbetaFrequency: '12' }), user, at);
    expect(term).toMatchObject({
      id: 'new-id',
      sourceTerm: '法',
      phonetic: 'fǎ',
      author: 'Ānanda',
      cbetaFrequency: '12',
      discussion: '',
      createdBy: 'user-1',
      updatedBy: 'user-1',
    });
  });

  // A translation's author is its document's, as given, not the user.
  it('keeps the document author as given', () => {
    expect(entryFromCreateForm(form({}, { author: 'Kumārajīva' }), user, at).translations[0].author).toBe('Kumārajīva');
  });

  it('creates every translation given, in order', () => {
    const { translations } = entryFromCreateForm(
      form({
        translations: [
          { term: 'Dharma', ...blank },
          { term: 'dharma', language: 'sanskrit', ...blank },
        ],
      }),
      user,
      at,
    );
    expect(translations.map(({ term, language }) => [term, language])).toEqual([
      ['Dharma', 'english'],
      ['dharma', 'sanskrit'],
    ]);
  });

  // PR 9: no placeholder source (佛教常用詞) or section ('-'); the term's author still
  // falls back to 翻譯團隊.
  it('leaves source and section blank, and keeps the term defaults', () => {
    const {
      term,
      translations: [translation],
    } = entryFromCreateForm(form(), { id: 'user-1' }, at);
    expect(term).toMatchObject({ author: '翻譯團隊', cbetaFrequency: '0', discussion: '' });
    expect(translation).toMatchObject({
      term: 'Dharma',
      language: 'english',
      sourceName: '',
      volume: '',
      author: '',
      updatedBy: 'user-1',
      updatedAt: '2026-11-06T00:00:00.000Z',
    });
  });
});
