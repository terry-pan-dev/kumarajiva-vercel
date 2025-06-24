import { z } from 'zod';

// Based on the glossary CSV structure from scripts/read-glossary.ts
export const glossaryCsvUploadSchema = z.object({
  file: z.instanceof(File).optional(),
});

// Required headers for glossary CSV - must match exactly
export const REQUIRED_GLOSSARY_HEADERS = [
  'UUID',
  'ChineseTerm',
  'EnglishTerm',
  'ChineseSutraText',
  'EnglishSutraText',
  'SutraName',
  'Volume',
  'CBetaFrequency',
  'Author',
  'Phonetic',
] as const;

export type GlossaryCsvUploadData = z.infer<typeof glossaryCsvUploadSchema>;
