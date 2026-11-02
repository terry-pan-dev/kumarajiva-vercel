// The working document's format: how each text — the source, the translation
// and each of the project's references — appears, and in what order. Checked
// when the page autosaves it, when a download passes it along, and when it is
// read back from projects.metadata.
import { z } from 'zod';

// Upper bound on one document's paragraphs, to keep a request (and a meeting)
// sane.
export const MAX_WORKING_DOCUMENT_PARAGRAPHS = 500;

// Fonts Google Docs knows by these names, so an imported document keeps them.
export const WORKING_DOCUMENT_FONTS = [
  'Noto Serif TC',
  'Noto Sans TC',
  'Times New Roman',
  'Palatino Linotype',
  'Arial',
  'Garamond',
] as const;

export const workingDocumentBlockSchema = z.object({
  // 'source', 'target' or 'reference:<documentId>'.
  key: z.string().min(1),
  label: z.string().max(60),
  font: z.enum(WORKING_DOCUMENT_FONTS),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  bold: z.boolean(),
  italic: z.boolean(),
});

export const workingDocumentFormatSchema = z.object({
  blocks: z.array(workingDocumentBlockSchema),
  // Print each text's page number after its label, when it has one. Optional
  // so formats saved before it existed still load; missing means on.
  showPages: z.boolean().optional(),
  // Print each paragraph's number above it. Optional for the same reason;
  // missing means on.
  showNumbers: z.boolean().optional(),
});

export type WorkingDocumentBlock = z.infer<typeof workingDocumentBlockSchema>;
export type WorkingDocumentFormat = z.infer<typeof workingDocumentFormatSchema>;

// What goes before a block's text: "Cleary (p. 201): ", "Cleary: ", or
// "(p. 201) " when the label is blank — or nothing at all. Shared by the .docx
// and the on-screen preview so they match.
export const workingDocumentBlockPrefix = (
  label: string,
  page: string | null | undefined,
  showPages: boolean | undefined,
): string => {
  const pageText = showPages !== false && page?.trim() ? `(p. ${page.trim()})` : '';
  if (label && pageText) return `${label} ${pageText}: `;
  if (label) return `${label}: `;
  return pageText ? `${pageText} ` : '';
};
