// The working document's format: which texts — the paragraph number, the
// source, the translation and each of the project's references — appear, how,
// and in what order. Checked
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

// Font sizes offered, in points.
export const WORKING_DOCUMENT_FONT_SIZES = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24] as const;
export const DEFAULT_WORKING_DOCUMENT_FONT_SIZE = 11;

// The entry key that prints the paragraph's number rather than a document's
// text.
export const NUMBER_BLOCK_KEY = 'number';

// One entry in the document: which text it prints (`key`) and how. The same
// text may appear in more than one entry, so each entry has its own `id`.
// `id`, `size`, `visible` and `labelBreak` are optional on the way in so
// formats saved before they existed still load: the id falls back to the key
// (keys were unique then), the size to the default, and the entry is shown
// with its label inline.
export const workingDocumentBlockSchema = z
  .object({
    id: z.string().min(1).optional(),
    // 'number', 'source', 'target' or 'reference:<documentId>'.
    key: z.string().min(1),
    label: z.string().max(60),
    font: z.enum(WORKING_DOCUMENT_FONTS),
    size: z.number().int().min(6).max(72).default(DEFAULT_WORKING_DOCUMENT_FONT_SIZE),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    bold: z.boolean(),
    italic: z.boolean(),
    // Whether the entry is printed; a hidden entry keeps its look for later.
    visible: z.boolean().default(true),
    // Put the label (and page) on a line of its own above the text.
    labelBreak: z.boolean().default(false),
  })
  .transform(({ id, ...block }) => ({ ...block, id: id ?? block.key }));

export const workingDocumentFormatSchema = z.object({
  blocks: z.array(workingDocumentBlockSchema),
  // Print each text's page number after its label, when it has one. Optional
  // so formats saved before it existed still load; missing means on.
  showPages: z.boolean().optional(),
  // Legacy: whether paragraph numbers were printed, from before the number
  // became an entry of its own. Only read to show or hide that entry when a
  // format saved before it is loaded; no longer written.
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

// What an entry prints for a paragraph: its number, or one of its texts
// (null when that document has none for it). Shared by the .docx and the
// preview.
export const workingDocumentBlockText = (
  key: string,
  paragraph: { number: string; texts: Record<string, string | null> },
): string | null | undefined => (key === NUMBER_BLOCK_KEY ? paragraph.number : paragraph.texts[key]);
