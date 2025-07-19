import { z } from 'zod';

export const paragraphUploadCsvSchema = z.object({
  OriginSutra: z.string().min(1, 'Origin sutra is required'),
  TargetSutra: z.string().optional(),
});

export const paragraphUploadSchema = z.object({
  sutraId: z.string().uuid('Invalid sutra ID'),
  rollId: z.string().uuid('Invalid roll ID'),
  csvData: z.array(z.record(z.string(), z.string().optional())).min(1, 'At least one row is required'),
});

export const bulkCreateParagraphsSchema = z.object({
  sutraId: z.string().uuid('Invalid sutra ID'),
  rollId: z.string().uuid('Invalid roll ID'),
  targetSutraId: z.string().uuid('Invalid target sutra ID').nullable().optional(),
  targetRollId: z.string().uuid('Invalid target roll ID').nullable().optional(),
  enableFullTextSearch: z.boolean().default(true),
  data: z
    .array(
      z.object({
        originSutra: z.string().min(1, 'Origin sutra is required'),
        targetSutra: z.string().optional(),
        references: z
          .array(
            z.object({
              sutraName: z.string().min(1, 'Reference sutra name is required'),
              content: z.string().min(1, 'Reference content is required'),
              order: z.string().default('0'),
            }),
          )
          .default([]),
      }),
    )
    .min(1, 'At least one paragraph is required')
    .max(10000, 'Cannot upload more than 10,000 paragraphs at once'),
});

export type ParagraphUploadCsvRow = z.infer<typeof paragraphUploadCsvSchema>;
export type ParagraphUploadData = z.infer<typeof paragraphUploadSchema>;
export type BulkCreateParagraphsData = z.infer<typeof bulkCreateParagraphsSchema>;
