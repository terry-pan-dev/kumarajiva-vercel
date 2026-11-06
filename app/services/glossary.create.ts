// What the Create Glossary Entry form becomes: the new term and its first translation. Pure (no
// database), so the mapping from form fields to stored fields is unit-tested.
import { type z } from 'zod';

import { type glossaryFormSchema } from '~/validations/glossary.validation';

import { type GlossaryTermInput } from './glossary.store';
import { type GlossaryTranslation } from './glossary.types';

export type GlossaryCreateForm = z.infer<typeof glossaryFormSchema>;

export function entryFromCreateForm(
  form: GlossaryCreateForm,
  user: { id: string; username?: string | null },
  { id, now }: { id: string; now: Date },
): { term: GlossaryTermInput; translations: GlossaryTranslation[] } {
  return {
    term: {
      id,
      glossary: form.glossaryChinese,
      phonetic: form.phoneticChinese,
      subscribers: 0,
      author: user.username || '翻譯團隊',
      cbetaFrequency: form.cbetaFrequencyChinese || '0',
      discussion: form.discussionChinese || '',
      createdBy: user.id,
      updatedBy: user.id,
    },
    translations: [
      {
        glossary: form.glossary,
        language: form.language,
        sutraName: form.sutraName || '佛教常用詞',
        volume: form.volume || '-',
        updatedBy: user.id,
        updatedAt: now.toISOString(),
        // The Chinese section's Sutra Text is the source passage, the translation section's
        // the target one. (Until PR 6a both got the translation section's text.)
        originSutraText: form.sutraTextChinese || '',
        targetSutraText: form.sutraText || '',
        author: form.author || '',
        partOfSpeech: form.partOfSpeech || '',
        phonetic: form.phonetic || '',
        rationale: form.rationale,
      },
    ],
  };
}
