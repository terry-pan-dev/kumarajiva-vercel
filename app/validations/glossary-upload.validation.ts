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

// Schema for bulk glossary upload to database
export const bulkGlossaryUploadSchema = z.object({
  uploadResults: z
    .array(
      z.object({
        id: z.string().min(1, 'ID is required'),
        glossary: z.string().min(1, 'Chinese term is required'),
        phonetic: z.string().optional(),
        author: z.string().optional(),
        cbetaFrequency: z.string().optional(),
        discussion: z.string().optional(),
        english: z.string().optional(),
        sutraName: z.string().optional(),
        volume: z.string().optional(),
        originSutraText: z.string().optional(),
        targetSutraText: z.string().optional(),
      }),
    )
    .min(1, 'At least one glossary entry is required')
    .max(50000, 'Cannot upload more than 50000 entries at once'),
});

export type GlossaryCsvUploadData = z.infer<typeof glossaryCsvUploadSchema>;
export type BulkGlossaryUploadData = z.infer<typeof bulkGlossaryUploadSchema>;
