// Where a run of paragraphs starts and ends across sections, worked out from
// section paragraph counts alone — so the working document page can show the
// range (and which sections it touches) without loading every section's text.
// Positions are 0-based within a section; paragraph numbers shown to people are
// "<section order>.<position + 1>".

export interface RangeSection {
  id: string;
  order: number;
  paragraphCount: number;
}

export interface ParagraphPosition {
  sectionId: string;
  position: number;
}

// First index (in document reading order) of each section's paragraphs.
const sectionOffsets = (sections: RangeSection[]) => {
  let offset = 0;
  return new Map(
    sections.map((s) => {
      const start = offset;
      offset += s.paragraphCount;
      return [s.id, start];
    }),
  );
};

export interface ParagraphRange {
  // Index range in reading order, end exclusive.
  from: number;
  to: number;
  // The last paragraph actually included, and how many that is — fewer than
  // asked for when the run reaches the end of the document.
  last: ParagraphPosition;
  included: number;
}

export const paragraphRange = (
  sections: RangeSection[],
  start: ParagraphPosition,
  count: number,
): ParagraphRange | null => {
  const offsets = sectionOffsets(sections);
  const sectionStart = offsets.get(start.sectionId);
  if (sectionStart === undefined || count < 1) return null;

  const total = sections.reduce((n, s) => n + s.paragraphCount, 0);
  const from = sectionStart + start.position;
  const to = Math.min(from + count, total);

  // Find the section holding the last included paragraph.
  const lastIndex = to - 1;
  const lastSection = sections.find((s) => {
    const offset = offsets.get(s.id)!;
    return lastIndex >= offset && lastIndex < offset + s.paragraphCount;
  })!;
  return {
    from,
    to,
    last: { sectionId: lastSection.id, position: lastIndex - offsets.get(lastSection.id)! },
    included: to - from,
  };
};

// Whether a paragraph falls inside a range.
export const inRange = (sections: RangeSection[], range: ParagraphRange, paragraph: ParagraphPosition) => {
  const offset = sectionOffsets(sections).get(paragraph.sectionId);
  if (offset === undefined) return false;
  const index = offset + paragraph.position;
  return index >= range.from && index < range.to;
};

// How many of a section's paragraphs fall inside a range (0 when none).
export const overlapWithSection = (sections: RangeSection[], range: ParagraphRange, sectionId: string) => {
  const section = sections.find((s) => s.id === sectionId);
  const offset = sectionOffsets(sections).get(sectionId);
  if (!section || offset === undefined) return 0;
  return Math.max(0, Math.min(range.to, offset + section.paragraphCount) - Math.max(range.from, offset));
};

export const paragraphNumber = (sections: RangeSection[], paragraph: ParagraphPosition) => {
  const section = sections.find((s) => s.id === paragraph.sectionId);
  return section ? `${section.order}.${paragraph.position + 1}` : '';
};
