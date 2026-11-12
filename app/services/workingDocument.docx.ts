// The working document: a set number of passages from a project, each showing
// its source, translation and reference texts, written to .docx for a
// translation working group meeting (it imports cleanly into Google Docs).
// Pure — no DB access — so it can be unit tested. How each text looks comes
// from the project's format (validations/workingDocument.validation.ts).
import { AlignmentType, Document, HeadingLevel, Paragraph, TextRun } from 'docx';

import {
  NUMBER_BLOCK_KEY,
  workingDocumentBlockPrefix,
  workingDocumentBlockText,
  type WorkingDocumentBlock,
} from '~/validations/workingDocument.validation';

// One source paragraph with its aligned texts, keyed by block key. A null text
// means that document has no paragraph for this passage yet. `pages` holds
// each text's page number in its printed source, keyed the same way (optional;
// none means no pages). `number` is "<section>.<paragraph>", e.g. "5.3".
export interface WorkingDocumentPassage {
  paragraphId: string;
  number: string;
  sectionId: string;
  sectionTitle: string | null;
  targetSectionTitle: string | null;
  texts: Record<string, string | null>;
  pages?: Record<string, string | null>;
}

const docxColor = (hex: string) => hex.replace('#', '');

// Set every script slot, so Chinese text (eastAsia) uses the chosen font too.
const docxFont = (name: string) => ({ ascii: name, hAnsi: name, eastAsia: name, cs: name });

// Heading lines in both languages, one per line, skipping any that are missing.
const bilingualParagraph = (
  lines: (string | null | undefined)[],
  options: { heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel]; center?: boolean },
) =>
  new Paragraph({
    heading: options.heading,
    alignment: options.center ? AlignmentType.CENTER : undefined,
    spacing: options.center ? undefined : { before: 240, after: 120 },
    children: lines
      .filter((line): line is string => Boolean(line))
      .map((line, i) => new TextRun({ text: line, break: i > 0 ? 1 : 0 })),
  });

// Paragraph text may carry line breaks; docx needs them as explicit breaks.
// The label (with the page, when shown) leads in bold, on its own line if the
// entry asks for it.
const blockParagraph = (
  block: WorkingDocumentBlock,
  text: string,
  page: string | null | undefined,
  showPages: boolean,
) => {
  // docx sizes are in half-points.
  const style = {
    color: docxColor(block.color),
    font: docxFont(block.font),
    size: block.size * 2,
    italics: block.italic,
  };
  const inline = workingDocumentBlockPrefix(block.label, page, showPages);
  const prefix = block.labelBreak ? inline.trimEnd() : inline;
  const textBreak = (i: number) => (i > 0 || (prefix && block.labelBreak) ? 1 : 0);
  return new Paragraph({
    children: [
      ...(prefix ? [new TextRun({ text: prefix, ...style, bold: true })] : []),
      ...text
        .split('\n')
        .map((line, i) => new TextRun({ text: line, break: textBreak(i), ...style, bold: block.bold })),
    ],
  });
};

const blank = () => new Paragraph({ text: '' });

// A heading (in both languages) whenever the passages cross into a new
// section, then each passage's entries in block order with a blank line
// between them — except straight after a paragraph number, which sits on the
// entry below it — and two blank lines to separate passages. Hidden entries,
// and texts a passage doesn't have yet, are left out.
const passageParagraphs = (
  passages: WorkingDocumentPassage[],
  blocks: WorkingDocumentBlock[],
  { showPages }: { showPages: boolean },
): Paragraph[] => {
  const paragraphs: Paragraph[] = [];
  const shown = blocks.filter((block) => block.visible);
  let currentSectionId: string | null = null;

  for (const passage of passages) {
    if (passage.sectionId !== currentSectionId && (passage.sectionTitle || passage.targetSectionTitle)) {
      paragraphs.push(
        bilingualParagraph([passage.sectionTitle, passage.targetSectionTitle], { heading: HeadingLevel.HEADING_2 }),
      );
    }
    currentSectionId = passage.sectionId;

    const entries = shown.flatMap((block) => {
      const text = workingDocumentBlockText(block.key, passage)?.trim();
      return text ? [{ block, paragraph: blockParagraph(block, text, passage.pages?.[block.key], showPages) }] : [];
    });
    entries.forEach(({ paragraph }, i) => {
      const afterNumber = entries[i - 1]?.block.key === NUMBER_BLOCK_KEY;
      paragraphs.push(...(i > 0 && !afterNumber ? [blank()] : []), paragraph);
    });
    paragraphs.push(blank(), blank());
  }
  return paragraphs;
};

export const buildWorkingDocument = (
  passages: WorkingDocumentPassage[],
  blocks: WorkingDocumentBlock[],
  // showPages: print page numbers after the labels (default on).
  meta: {
    titles: (string | null | undefined)[];
    subtitle?: string | null;
    showPages?: boolean;
  },
): Document =>
  new Document({
    sections: [
      {
        children: [
          bilingualParagraph(meta.titles, { heading: HeadingLevel.HEADING_1, center: true }),
          ...(meta.subtitle ? [new Paragraph({ alignment: AlignmentType.CENTER, text: meta.subtitle })] : []),
          blank(),
          ...passageParagraphs(passages, blocks, { showPages: meta.showPages !== false }),
        ],
      },
    ],
  });

// Paragraph numbers only count within a section, so the range names its
// sections: e.g. "Team A 序品第一 3–20.docx", or "Team A 序品第一 30–方便品第二 4.docx"
// across sections. Characters that are unsafe in file names are dropped.
export const buildWorkingDocumentFilename = (projectName: string, passages: WorkingDocumentPassage[]): string => {
  const first = passages[0];
  const last = passages[passages.length - 1];
  const at = (p: WorkingDocumentPassage) => (p.sectionTitle ? `${p.sectionTitle} ${p.number}` : p.number);
  const range = !first
    ? ''
    : first === last
      ? ` ${at(first)}`
      : first.sectionId === last.sectionId
        ? ` ${at(first)}–${last.number}`
        : ` ${at(first)}–${at(last)}`;
  const name = `${projectName || 'translation'}${range}`.replace(/[\\/:*?"<>|]/g, '').trim();
  return `${name}.docx`;
};
