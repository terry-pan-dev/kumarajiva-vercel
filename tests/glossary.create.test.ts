import { describe, expect, it } from 'vitest';

import { entryFromCreateForm } from '~/services/glossary.create';
import { glossaryFormSchema } from '~/validations/glossary.validation';

const user = { id: 'user-1', username: 'Ānanda' };
const at = { id: 'new-id', now: new Date('2026-11-06T00:00:00.000Z') };
const form = (fields: Record<string, unknown> = {}) =>
  glossaryFormSchema.parse({ glossaryChinese: '法', phoneticChinese: 'fǎ', glossary: 'Dharma', ...fields });

describe('entryFromCreateForm', () => {
  // The form has a Sutra Text field in each section. Both used to land in both passages.
  it('puts the Chinese section’s sutra text in the source passage and the translation’s in the target', () => {
    const {
      translations: [translation],
    } = entryFromCreateForm(form({ sutraTextChinese: '佛告阿難', sutraText: 'The Buddha told Ānanda' }), user, at);
    expect(translation.sourceText).toBe('佛告阿難');
    expect(translation.targetText).toBe('The Buddha told Ānanda');
  });

  it('leaves a passage empty when only the other one is given', () => {
    const {
      translations: [translation],
    } = entryFromCreateForm(form({ sutraText: 'The Buddha told Ānanda' }), user, at);
    expect(translation.sourceText).toBe('');
    expect(translation.targetText).toBe('The Buddha told Ānanda');
  });

  it('carries the rationale, and null when none is given', () => {
    expect(entryFromCreateForm(form({ rationale: 'technical sense' }), user, at).translations[0].rationale).toBe(
      'technical sense',
    );
    expect(entryFromCreateForm(form(), user, at).translations[0].rationale).toBeNull();
  });

  it('builds the term from the Chinese section, credited to the user', () => {
    const { term } = entryFromCreateForm(form({ cbetaFrequencyChinese: '12' }), user, at);
    expect(term).toMatchObject({
      id: 'new-id',
      sourceTerm: '法',
      phonetic: 'fǎ',
      author: 'Ānanda',
      cbetaFrequency: '12',
      createdBy: 'user-1',
      updatedBy: 'user-1',
    });
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
