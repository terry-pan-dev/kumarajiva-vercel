// What the Create Glossary Entry form becomes: the new term and its translations. Pure (no
// database), so the mapping from form fields to stored fields is unit-tested.
import { type z } from 'zod';

import { type glossaryCreateFormSchema } from '~/validations/glossary.validation';

import { type GlossaryTermInput } from './glossary.store';
import { type GlossaryTranslation } from './glossary.types';

export type GlossaryCreateForm = z.infer<typeof glossaryCreateFormSchema>;

export function entryFromCreateForm(
  form: GlossaryCreateForm,
  user: { id: string; username?: string | null },
  { id, now }: { id: string; now: Date },
): { term: GlossaryTermInput; translations: GlossaryTranslation[] } {
  return {
    term: {
      id,
      sourceTerm: form.sourceTerm,
      phonetic: form.phonetic,
      // Who created the entry; the form does not ask for it.
      author: user.username || '翻譯團隊',
      cbetaFrequency: form.cbetaFrequency || '0',
      discussion: '',
      createdBy: user.id,
      updatedBy: user.id,
    },
    translations: form.translations.map((translation) => ({
      term: translation.term,
      language: translation.language,
      // Blank stays blank: no placeholder source or section (PR 9).
      sourceName: translation.sourceName,
      volume: translation.volume,
      sourceText: translation.sourceText || '',
      targetText: translation.targetText || '',
      // The translated document's author, as given; blank when not.
      author: translation.author || '',
      partOfSpeech: translation.partOfSpeech || '',
      phonetic: translation.phonetic || '',
      discussion: translation.discussion,
      updatedBy: user.id,
      updatedAt: now.toISOString(),
    })),
  };
}
