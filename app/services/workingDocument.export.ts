// The working document export, apart from building the .docx itself
// (workingDocument.docx.ts): reading a project's text for it — the page's
// sections and paragraph cards, where the next export starts, and the passages
// that go into the document — and the project's saved format and bookmark.
// Built on the generic paragraph reads in text.service.ts and the project's
// metadata.
//
// Paragraphs are numbered by their position in their section (e.g. 3) —
// always present and readable, unlike passage keys, which are not yet filled in
// consistently. Position counts non-parked paragraphs in reading order. The
// section isn't part of the number: its order is only its place in the list,
// not e.g. its roll number, so it can't be relied on to mean anything.
import { z } from 'zod';

import { metadataField, type Metadata } from '~/utils/metadata';
import {
  DEFAULT_WORKING_DOCUMENT_FONT_SIZE,
  NUMBER_BLOCK_KEY,
  workingDocumentFormatSchema,
  type WorkingDocumentBlock,
  type WorkingDocumentFormat,
} from '~/validations/workingDocument.validation';

import { mergeProjectMetadata } from './project.service';
import {
  getParagraph,
  getSection,
  getSectionParagraphCounts,
  getSectionsByDocument,
  readParagraphsByDocumentId,
  readParagraphsBySectionId,
  type IParagraphNew,
  type ReferenceDocument,
} from './text.service';
import { type WorkingDocumentPassage } from './workingDocument.docx';

interface ProjectDocuments {
  sourceDocumentId: string;
  targetDocumentId: string;
  references: ReferenceDocument[];
}

// A paragraph's texts keyed as the format's blocks are: 'source', 'target' and
// 'reference:<documentId>'. Null means that document has no paragraph for it.
const textsOf = (paragraph: IParagraphNew): Record<string, string | null> => ({
  source: paragraph.origin,
  target: paragraph.target,
  ...Object.fromEntries(paragraph.references.map((r) => [`reference:${r.documentId}`, r.content])),
});

// Each text's page number in its printed source, keyed like textsOf; null when
// that paragraph has none.
const pagesOf = (paragraph: IParagraphNew): Record<string, string | null> => ({
  source: paragraph.metadata?.page ?? null,
  target: paragraph.targetMetadata?.page ?? null,
  ...Object.fromEntries(paragraph.references.map((r) => [`reference:${r.documentId}`, r.metadata?.page ?? null])),
});

// ─── Sections ────────────────────────────────────────────────────────────────

export interface WorkingDocumentSection {
  id: string;
  title: string | null;
  // The counterpart section's title in the target document (matched by order).
  targetTitle: string | null;
  order: number;
  paragraphCount: number;
}

// The source document's sections that have paragraphs, in reading order, with
// their paragraph counts — enough to lay out the page and to work out where a
// run of paragraphs ends without loading any text.
export const readWorkingDocumentSections = async ({
  sourceDocumentId,
  targetDocumentId,
}: Omit<ProjectDocuments, 'references'>): Promise<WorkingDocumentSection[]> => {
  const [sections, counts, targetSections] = await Promise.all([
    getSectionsByDocument(sourceDocumentId),
    getSectionParagraphCounts(sourceDocumentId),
    getSectionsByDocument(targetDocumentId),
  ]);
  // A translated section is paired with its source section by order.
  const targetTitles = new Map(targetSections.map((s) => [s.order, s.title]));
  return sections
    .map((s) => ({
      id: s.id,
      title: s.title,
      targetTitle: targetTitles.get(s.order) ?? null,
      order: s.order,
      paragraphCount: counts.get(s.id) ?? 0,
    }))
    .filter((s) => s.paragraphCount > 0)
    .sort((a, b) => a.order - b.order);
};

// ─── Where the next export starts ────────────────────────────────────────────

export interface WorkingDocumentStart {
  sectionId: string;
  position: number;
  paragraphId: string;
}

// The paragraph after the last one exported, running on into the next
// section. If the last export reached the end of the document, start at that
// last paragraph again (anything added later comes after it). Without a usable
// bookmark — never exported, or the paragraph has since been removed — start
// at the beginning.
export const resolveWorkingDocumentStart = async ({
  sections,
  lastExportedParagraphId,
}: {
  sections: WorkingDocumentSection[];
  lastExportedParagraphId: string | null;
}): Promise<{
  start: WorkingDocumentStart | null;
  lastExported: { number: string; sectionTitle: string | null; atEnd: boolean } | null;
}> => {
  const firstOf = async (sectionIndex: number): Promise<WorkingDocumentStart | null> => {
    const section = sections[sectionIndex];
    const [first] = section ? await readParagraphsBySectionId({ sectionId: section.id, limit: 1 }) : [];
    return first ? { sectionId: section.id, position: 0, paragraphId: first.id } : null;
  };

  const last = lastExportedParagraphId ? await getParagraph(lastExportedParagraphId) : undefined;
  const sectionIndex = last ? sections.findIndex((s) => s.id === last.sectionId) : -1;
  if (!last || sectionIndex < 0) return { start: await firstOf(0), lastExported: null };

  const section = sections[sectionIndex];
  const siblings = await readParagraphsBySectionId({ sectionId: section.id });
  const position = siblings.findIndex((p) => p.id === last.id);
  // Parked since the export (order < 0): no longer in reading order.
  if (position < 0) return { start: await firstOf(0), lastExported: null };

  const exported = { number: String(position + 1), sectionTitle: section.title };
  const next =
    position + 1 < siblings.length
      ? { sectionId: section.id, position: position + 1, paragraphId: siblings[position + 1].id }
      : await firstOf(sectionIndex + 1);
  return next
    ? { start: next, lastExported: { ...exported, atEnd: false } }
    : {
        start: { sectionId: section.id, position, paragraphId: last.id },
        lastExported: { ...exported, atEnd: true },
      };
};

// ─── Cards ───────────────────────────────────────────────────────────────────

export interface WorkingDocumentCard {
  id: string;
  number: string;
  passageKey: string | null;
  texts: Record<string, string | null>;
  pages: Record<string, string | null>;
}

const EXCERPT_LENGTH = 120;

// One section's paragraphs as cards: number, passage key and an excerpt of
// each aligned text, so gaps in the data are visible at a glance.
export const readWorkingDocumentCards = async ({
  sectionId,
  sourceDocumentId,
  targetDocumentId,
  references,
}: ProjectDocuments & { sectionId: string }): Promise<WorkingDocumentCard[]> => {
  const section = await getSection(sectionId);
  if (!section || section.documentId !== sourceDocumentId) {
    throw new Error('This section is not in the project’s source document.');
  }
  const paragraphs = await readParagraphsBySectionId({ sectionId, targetDocumentId, references });

  return paragraphs.map((paragraph, i) => ({
    id: paragraph.id,
    number: String(i + 1),
    passageKey: paragraph.passageKey,
    texts: Object.fromEntries(
      Object.entries(textsOf(paragraph)).map(([key, text]) => [key, text?.slice(0, EXCERPT_LENGTH) ?? null]),
    ),
    pages: pagesOf(paragraph),
  }));
};

// ─── Passages ────────────────────────────────────────────────────────────────

// `count` source paragraphs in reading order from the start paragraph —
// running on across section boundaries and stopping at the end of the
// document — each with its full translation and reference texts.
export const readPassagesForWorkingDocument = async ({
  sourceDocumentId,
  targetDocumentId,
  references,
  startParagraphId,
  count,
}: ProjectDocuments & { startParagraphId: string; count: number }): Promise<WorkingDocumentPassage[]> => {
  // The source alone (unpaired) to find the range and number it; the paired
  // texts are then read only for the sections the range touches.
  const [paragraphs, sections, targetSections] = await Promise.all([
    readParagraphsByDocumentId({ documentId: sourceDocumentId }),
    getSectionsByDocument(sourceDocumentId),
    getSectionsByDocument(targetDocumentId),
  ]);
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const targetTitles = new Map(targetSections.map((s) => [s.order, s.title]));

  // Number every paragraph by its position within its section.
  const numbers = new Map<string, string>();
  let position = 0;
  paragraphs.forEach((p, i) => {
    position = i > 0 && paragraphs[i - 1].sectionId === p.sectionId ? position + 1 : 1;
    numbers.set(p.id, String(position));
  });

  const startIndex = paragraphs.findIndex((p) => p.id === startParagraphId);
  if (startIndex < 0) {
    throw new Error('The start paragraph is not in this project’s source document.');
  }
  const range = paragraphs.slice(startIndex, startIndex + count);

  const sectionIds = [...new Set(range.map((p) => p.sectionId))];
  const paired = new Map(
    (
      await Promise.all(
        sectionIds.map((sectionId) => readParagraphsBySectionId({ sectionId, targetDocumentId, references })),
      )
    )
      .flat()
      .map((p) => [p.id, p]),
  );

  return range.map((paragraph) => {
    const section = sectionById.get(paragraph.sectionId);
    const full = paired.get(paragraph.id) ?? paragraph;
    return {
      paragraphId: paragraph.id,
      number: numbers.get(paragraph.id)!,
      sectionId: paragraph.sectionId,
      sectionTitle: section?.title ?? null,
      targetSectionTitle: section ? (targetTitles.get(section.order) ?? null) : null,
      texts: textsOf(full),
      pages: pagesOf(full),
    };
  });
};

// ─── Format ──────────────────────────────────────────────────────────────────

const REFERENCE_COLORS = ['#6b7280', '#047857', '#b45309', '#7c3aed', '#be123c'];

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const defaultWorkingDocumentBlock = (
  key: string,
  label: string,
  font: WorkingDocumentBlock['font'],
  color: string,
  size: number = DEFAULT_WORKING_DOCUMENT_FONT_SIZE,
): WorkingDocumentBlock => ({
  id: key,
  key,
  label,
  font,
  size,
  color,
  bold: false,
  italic: false,
  visible: true,
  labelBreak: false,
});

// The paragraph number, small, grey and unlabelled, as it was printed before
// it could be formatted.
const defaultNumberBlock = () => defaultWorkingDocumentBlock(NUMBER_BLOCK_KEY, '', 'Times New Roman', '#808080', 8);

// The paragraph number, then one entry per text, shown, at the default size:
// source (Chinese serif, black), translation (Times New Roman, blue), then
// each reference in the project's order, labelled by its capitalised document
// key (or title).
export const defaultWorkingDocumentFormat = (project: { references: ReferenceDocument[] }): WorkingDocumentFormat => ({
  blocks: [
    defaultNumberBlock(),
    defaultWorkingDocumentBlock('source', 'Source', 'Noto Serif TC', '#000000'),
    defaultWorkingDocumentBlock('target', 'Translation', 'Times New Roman', '#1d4ed8'),
    ...project.references.map((ref, i) =>
      defaultWorkingDocumentBlock(
        `reference:${ref.documentId}`,
        capitalise(ref.document.key ?? ref.document.title),
        'Times New Roman',
        REFERENCE_COLORS[i % REFERENCE_COLORS.length],
      ),
    ),
  ],
  showPages: true,
});

// Fits a saved format to the project as it is now: the page setting carries
// over, saved entries keep their order and look (including extra entries for
// the same text); entries for references removed since are dropped, and each
// text with no entry — a reference added since — is appended with its
// defaults. A format saved before the paragraph number was an entry gets it
// back first, shown or hidden as its old switch said. Anything unusable falls
// back to defaults.
export const reconcileWorkingDocumentFormat = (
  saved: WorkingDocumentFormat | undefined,
  defaults: WorkingDocumentFormat,
): WorkingDocumentFormat => {
  if (!saved) return defaults;
  const available = new Set(defaults.blocks.map((b) => b.key));
  const kept = saved.blocks.filter(
    (block, i, all) => available.has(block.key) && all.findIndex((b) => b.id === block.id) === i,
  );
  const keptKeys = new Set(kept.map((b) => b.key));
  const missing = defaults.blocks.filter((b) => !keptKeys.has(b.key));
  const number = missing
    .filter((b) => b.key === NUMBER_BLOCK_KEY)
    .map((b) => ({ ...b, visible: saved.showNumbers !== false }));
  return {
    blocks: [...number, ...kept, ...missing.filter((b) => b.key !== NUMBER_BLOCK_KEY)],
    showPages: saved.showPages ?? defaults.showPages,
  };
};

// ─── Saved in the project ────────────────────────────────────────────────────
//
// The `workingDocument` section of projects.metadata holds the last source
// paragraph exported (the next working document starts after it) and the
// team's format for the document.

const METADATA_SECTION = 'workingDocument';

export const getLastExportedParagraphId = (project: { metadata: Metadata }) =>
  metadataField(project.metadata, METADATA_SECTION, 'lastExportedParagraphId', z.string()) ?? null;

// The project's saved format, fitted to its current references.
export const getWorkingDocumentFormat = (project: { metadata: Metadata; references: ReferenceDocument[] }) =>
  reconcileWorkingDocumentFormat(
    metadataField(project.metadata, METADATA_SECTION, 'format', workingDocumentFormatSchema),
    defaultWorkingDocumentFormat(project),
  );

export const recordWorkingDocumentExport = async (projectId: string, lastParagraphId: string) => {
  return mergeProjectMetadata(projectId, METADATA_SECTION, { lastExportedParagraphId: lastParagraphId });
};

export const saveWorkingDocumentFormat = async (projectId: string, format: WorkingDocumentFormat) => {
  return mergeProjectMetadata(projectId, METADATA_SECTION, { format });
};
