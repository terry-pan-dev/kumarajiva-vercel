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
      sourceTerm: form.glossaryChinese,
      phonetic: form.phoneticChinese,
      author: user.username || '翻譯團隊',
      cbetaFrequency: form.cbetaFrequencyChinese || '0',
      discussion: form.discussionChinese || '',
      createdBy: user.id,
      updatedBy: user.id,
    },
    translations: [
      {
        term: form.glossary,
        language: form.language,
        // Blank stays blank: no placeholder source or section (PR 9).
        sourceName: form.sutraName || '',
        volume: form.volume || '',
        updatedBy: user.id,
        updatedAt: now.toISOString(),
        // The Chinese section's Sutra Text is the source passage, the translation section's
        // the target one. (Until PR 6a both got the translation section's text.)
        sourceText: form.sutraTextChinese || '',
        targetText: form.sutraText || '',
        author: form.author || '',
        partOfSpeech: form.partOfSpeech || '',
        phonetic: form.phonetic || '',
        rationale: form.rationale,
      },
    ],
  };
}
