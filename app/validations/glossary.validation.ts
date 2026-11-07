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

export const glossaryFormSchema = z.object({
  glossaryChinese: z
    .string()
    .min(1, {
      message: 'Glossary must be at least 1 characters.',
    })
    .regex(chineseRegex, {
      message: 'Glossary only accept chinese',
    }),
  phoneticChinese: z.string(),
  sutraTextChinese: z.string().optional(),
  volumeChinese: z.string().optional(),
  cbetaFrequencyChinese: z.string().optional(),
  authorChinese: z.string().optional(),
  discussionChinese: z.string().optional(),
  glossary: z.string().min(1, {
    message: 'Glossary must be at least 1 characters.',
  }),
  // The language of the translation term; the form offers English first.
  language: z.enum(GLOSSARY_TRANSLATION_LANGUAGES).default(DEFAULT_TARGET_LANG),
  sutraText: z.string().optional(),
  sutraName: z.string().optional(),
  volume: z.string().optional(),
  author: z.string().optional(),
  partOfSpeech: z.string().optional(),
  phonetic: z.string().optional(),
  discussion: discussionSchema,
});

export const glossaryEditFormSchema = z.object({
  id: z.string(),
  sourceTerm: z.string(),
  phonetic: z.string(),
  author: z.string().nullish(),
  cbetaFrequency: z.string().nullish(),
  discussion: z.string().nullish(),
  // The ids of the translations the form was opened with, carried like each translation's id
  // (default values, no input). A translation added by someone else while the form was open is
  // not among them, so the save keeps it instead of reading its absence as a removal.
  baseTranslationIds: z.array(z.string().uuid()).optional(),
  translations: z.array(
    z.object({
      // The stored translation this row edits. Carried from the form's default values (no
      // input), so a save updates translations in place instead of replacing them all.
      id: z.string().uuid().optional(),
      term: z.string(),
      language: z.enum(LANG_VALUES),
      sourceName: z.string(),
      volume: z.string(),
      sourceText: z.string().nullish(),
      targetText: z.string().nullish(),
      author: z.string().nullish(),
      partOfSpeech: z.string().nullish(),
      phonetic: z.string().nullish(),
      discussion: discussionSchema,
    }),
  ),
});

export const glossaryInsertFormSchema = z.object({
  id: z.string(),
  term: z.string(),
  language: z.enum(GLOSSARY_TRANSLATION_LANGUAGES).default(DEFAULT_TARGET_LANG),
  // Blank is stored as blank: no placeholder source, section or author (PR 9, the user's
  // decision, 2026-11-06). Still required, so a post without them is refused.
  sourceName: z.string(),
  volume: z.string(),
  sourceText: z.string().nullish(),
  targetText: z.string().nullish(),
  author: z.string(),
  partOfSpeech: z.string().nullish(),
  phonetic: z.string().nullish(),
  discussion: discussionSchema,
});
