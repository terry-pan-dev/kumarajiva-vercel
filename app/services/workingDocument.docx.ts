// The working document: a set number of passages from a project, each showing
// its source, translation and reference texts, written to .docx for a
// translation working group meeting (it imports cleanly into Google Docs).
// Pure — no DB access — so it can be unit tested. How each text looks comes
// from the project's format (validations/workingDocument.validation.ts).
import { AlignmentType, Document, HeadingLevel, Paragraph, TextRun } from 'docx';

import { workingDocumentBlockPrefix, type WorkingDocumentBlock } from '~/validations/workingDocument.validation';

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
// The label (with the page, when shown) leads in bold.
const blockParagraph = (
  block: WorkingDocumentBlock,
  text: string,
  page: string | null | undefined,
  showPages: boolean,
) => {
  const style = { color: docxColor(block.color), font: docxFont(block.font), italics: block.italic };
  const prefix = workingDocumentBlockPrefix(block.label, page, showPages);
  return new Paragraph({
    children: [
      ...(prefix ? [new TextRun({ text: prefix, ...style, bold: true })] : []),
      ...text
        .split('\n')
        .map((line, i) => new TextRun({ text: line, break: i > 0 ? 1 : 0, ...style, bold: block.bold })),
    ],
  });
};

const blank = () => new Paragraph({ text: '' });

// A heading (in both languages) whenever the passages cross into a new
// section, the paragraph number in small grey above each passage, then its
// texts in block order with a blank line between them, and two blank lines to
// separate passages. Texts a passage doesn't have yet are left out.
const passageParagraphs = (
  passages: WorkingDocumentPassage[],
  blocks: WorkingDocumentBlock[],
  showPages: boolean,
): Paragraph[] => {
  const paragraphs: Paragraph[] = [];
  let currentSectionId: string | null = null;

  for (const passage of passages) {
    if (passage.sectionId !== currentSectionId && (passage.sectionTitle || passage.targetSectionTitle)) {
      paragraphs.push(
        bilingualParagraph([passage.sectionTitle, passage.targetSectionTitle], { heading: HeadingLevel.HEADING_2 }),
      );
    }
    currentSectionId = passage.sectionId;

    paragraphs.push(new Paragraph({ children: [new TextRun({ text: passage.number, color: '808080', size: 16 })] }));
    const texts = blocks.flatMap((block) => {
      const text = passage.texts[block.key]?.trim();
      return text ? [blockParagraph(block, text, passage.pages?.[block.key], showPages)] : [];
    });
    texts.forEach((text, i) => paragraphs.push(...(i > 0 ? [blank()] : []), text));
    paragraphs.push(blank(), blank());
  }
  return paragraphs;
};

export const buildWorkingDocument = (
  passages: WorkingDocumentPassage[],
  blocks: WorkingDocumentBlock[],
  // showPages: print page numbers after the labels (default on).
  meta: { titles: (string | null | undefined)[]; subtitle?: string | null; showPages?: boolean },
): Document =>
  new Document({
    sections: [
      {
        children: [
          bilingualParagraph(meta.titles, { heading: HeadingLevel.HEADING_1, center: true }),
          ...(meta.subtitle ? [new Paragraph({ alignment: AlignmentType.CENTER, text: meta.subtitle })] : []),
          blank(),
          ...passageParagraphs(passages, blocks, meta.showPages !== false),
        ],
      },
    ],
  });

// e.g. "Team A 5.3–6.2.docx"; characters that are unsafe in file names are
// dropped.
export const buildWorkingDocumentFilename = (projectName: string, passages: WorkingDocumentPassage[]): string => {
  const first = passages[0]?.number;
  const last = passages[passages.length - 1]?.number;
  const range = first && last ? (first === last ? ` ${first}` : ` ${first}–${last}`) : '';
  const name = `${projectName || 'translation'}${range}`.replace(/[\\/:*?"<>|]/g, '').trim();
  return `${name}.docx`;
};
