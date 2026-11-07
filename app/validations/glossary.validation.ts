import { z } from 'zod';

import { chineseRegex } from '~/lib/utils';
import { DEFAULT_TARGET_LANG, LANG_VALUES } from '~/utils/constants';
import { GLOSSARY_TRANSLATION_LANGUAGES } from '~/utils/lang';

// A translation's discussion (notes, e.g. why a rendering was chosen; `rationale` until
// 2026-11-07): optional free text, trimmed, no length limit (the user's decision,
// 2026-11-06). Blank is stored as null, the same as never given, so clearing the field in the
// edit form is not mistaken for an edit of it.
export const discussionSchema = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value || null);

// One translation as the glossary forms send it: the create form's, an existing one in the edit
// form, or one added there. Only the rendering is required; everything else is optional and
// blank is stored as blank (the user's decision, 2026-11-07). `author` is the author of the
// translated document, not whoever enters the translation (that is `updatedBy`).
const translationFormFields = {
  term: z.string().trim().min(1, { message: 'The translation term is required.' }),
  // Sent even when blank (the forms always render them), so a page posting the old field
  // names (sutraName, before PR 8a) is refused rather than saved without them.
  sourceName: z.string(),
  volume: z.string(),
  sourceText: z.string().nullish(),
  targetText: z.string().nullish(),
  author: z.string().nullish(),
  partOfSpeech: z.string().nullish(),
  phonetic: z.string().nullish(),
  discussion: discussionSchema,
};

// The create form: a new term and its translations, in the same shape as the edit form. The
// term's author is not asked for: it records who created the entry and is set from the user.
export const glossaryCreateFormSchema = z.object({
  sourceTerm: z
    .string()
    .trim()
    .min(1, { message: 'The Chinese term is required.' })
    .regex(chineseRegex, { message: 'The term must be Chinese.' }),
  phonetic: z.string(),
  cbetaFrequency: z.string().nullish(),
  translations: z
    .array(
      z.object({
        ...translationFormFields,
        // The form offers English first.
        language: z.enum(GLOSSARY_TRANSLATION_LANGUAGES).default(DEFAULT_TARGET_LANG),
      }),
    )
    .min(1, { message: 'Add at least one translation.' }),
});

// The edit form. The term's author (who created the entry) and its discussion (only ever blank,
// to be dropped) are not edited here; a page that still posts them has them ignored.
export const glossaryEditFormSchema = z.object({
  id: z.string(),
  sourceTerm: z.string(),
  phonetic: z.string(),
  cbetaFrequency: z.string().nullish(),
  // The ids of the translations the form was opened with, carried like each translation's id
  // (default values, no input). A translation added by someone else while the form was open is
  // not among them, so the save keeps it instead of reading its absence as a removal.
  baseTranslationIds: z.array(z.string().uuid()).optional(),
  translations: z.array(
    z
      .object({
        // The stored translation this row edits. Carried from the form's default values (no
        // input), so a save updates translations in place instead of replacing them all. A
        // row without one is a translation added in the form.
        id: z.string().uuid().optional(),
        ...translationFormFields,
        language: z.enum(LANG_VALUES),
      })
      // A stored translation keeps whatever language it has; an added one must be a language
      // the glossary translates into (not Chinese), as on the create form.
      .refine(
        (translation) =>
          translation.id !== undefined ||
          (GLOSSARY_TRANSLATION_LANGUAGES as readonly string[]).includes(translation.language),
        { message: 'Not a translation language.', path: ['language'] },
      ),
  ),
});
