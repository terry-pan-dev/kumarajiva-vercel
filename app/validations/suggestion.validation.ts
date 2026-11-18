// The shapes of a glossary suggestion's values (docs/plans/glossary-suggestions.md). The
// `suggestions` table stores them as jsonb (`submitted`, `proposed`, `base`, `context`); these
// schemas are what keeps that jsonb honest, on submit, on enrich and before accepting.
//
// A suggestion asks for as little as possible: a rendering is the only required field of a
// translation, and the Chinese term the only other one of a new term. Everything else is filled
// in later by enrichers, or never.
import { z } from 'zod';

import { chineseRegex } from '~/lib/utils';
import { DEFAULT_TARGET_LANG } from '~/utils/constants';
import { GLOSSARY_TRANSLATION_LANGUAGES } from '~/utils/lang';

// Optional free text: trimmed, blank is "not given" (null), like the glossary forms' discussion.
const optionalText = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value || null);

const rendering = z.string().trim().min(1, { message: 'The translation is required.' });

// A translation's content fields, the same names as GlossaryTranslation (glossary.types.ts).
// `discussion` is the translation's own discussion, applied with the rest on accept; the
// submitter's note is a separate field of the suggestion and never lands here.
const contentFields = {
  sourceName: optionalText,
  volume: optionalText,
  sourceText: optionalText,
  targetText: optionalText,
  author: optionalText,
  partOfSpeech: optionalText,
  phonetic: optionalText,
  discussion: optionalText,
};

export const TRANSLATION_CONTENT_FIELDS = [
  'term',
  'language',
  'sourceName',
  'volume',
  'sourceText',
  'targetText',
  'author',
  'partOfSpeech',
  'phonetic',
  'discussion',
] as const;
export type TranslationContentField = (typeof TRANSLATION_CONTENT_FIELDS)[number];

// A new translation: a rendering, in a language the glossary translates into (English unless
// said otherwise), and whatever else the submitter had.
export const proposedTranslationSchema = z.object({
  term: rendering,
  language: z.enum(GLOSSARY_TRANSLATION_LANGUAGES).default(DEFAULT_TARGET_LANG),
  ...contentFields,
});
export type ProposedTranslation = z.infer<typeof proposedTranslationSchema>;

// A new term and its first translation.
export const proposedTermSchema = z.object({
  sourceTerm: z
    .string()
    .trim()
    .min(1, { message: 'The Chinese term is required.' })
    .regex(chineseRegex, { message: 'The term must be Chinese.' }),
  phonetic: optionalText,
  cbetaFrequency: optionalText,
  translation: proposedTranslationSchema,
});
export type ProposedTerm = z.infer<typeof proposedTermSchema>;

// An edit: only the fields it changes. A stored translation keeps its language, so language is
// not editable here. A rendering, if given, cannot be blank: a translation always has one.
// Every field is optional, and one the edit does not mention stays out of the result (partial()
// skips the blank-to-null transform for it): only a field given as blank is null, "clear it".
export const proposedEditSchema = z
  .object({ term: rendering, ...contentFields })
  .partial()
  .refine((edit) => Object.values(edit).some((value) => value !== undefined), {
    message: 'The suggestion changes nothing.',
  });
export type ProposedEdit = Partial<Record<Exclude<TranslationContentField, 'language'>, string | null>>;

// Where a suggestion was made, when it came from the working document. All optional; unknown
// keys are dropped.
export const suggestionContextSchema = z
  .object({
    projectId: z.string().uuid().optional(),
    documentId: z.string().uuid().optional(),
    sectionId: z.string().uuid().optional(),
    paragraphId: z.string().uuid().optional(),
    page: z.string().trim().min(1).optional(),
  })
  .nullish()
  .transform((value) => value ?? null);
export type SuggestionContext = z.infer<typeof suggestionContextSchema>;

// The submitter's note, a review note, a decision note: optional free text.
export const noteSchema = optionalText;

// What the suggestion endpoint (/resources/suggestions) accepts to submit one. The values
// (`proposed`, `note`, `context`) are checked by the schemas above, in the service, according to
// the kind; here only the kind and the ids it names.
const values = { proposed: z.unknown(), note: z.unknown().optional(), context: z.unknown().optional() };
export const submitRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('new-term'), ...values }),
  z.object({ kind: z.literal('new-translation'), glossaryId: z.string().uuid(), ...values }),
  z.object({ kind: z.literal('edit'), glossaryId: z.string().uuid(), translationId: z.string().uuid(), ...values }),
  z.object({
    kind: z.literal('flag'),
    glossaryId: z.string().uuid(),
    translationId: z.string().uuid(),
    note: z.unknown(),
    context: z.unknown().optional(),
  }),
]);
