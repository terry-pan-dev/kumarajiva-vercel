import { describe, expect, it } from 'vitest';

import {
  inRange,
  overlapWithSection,
  paragraphNumber,
  paragraphRange,
} from '~/components/translation/workingDocumentRange';

// Three sections of 3, 2 and 4 paragraphs: reading-order indexes 0–2, 3–4, 5–8.
const sections = [
  { id: 'a', order: 1, paragraphCount: 3 },
  { id: 'b', order: 2, paragraphCount: 2 },
  { id: 'c', order: 5, paragraphCount: 4 },
];

describe('paragraphRange', () => {
  it('stays within a section when the count fits', () => {
    expect(paragraphRange(sections, { sectionId: 'a', position: 0 }, 2)).toEqual({
      from: 0,
      to: 2,
      last: { sectionId: 'a', position: 1 },
      included: 2,
    });
  });

  it('runs on across section boundaries', () => {
    expect(paragraphRange(sections, { sectionId: 'a', position: 2 }, 4)).toMatchObject({
      from: 2,
      to: 6,
      last: { sectionId: 'c', position: 0 },
      included: 4,
    });
  });

  it('stops at the end of the document', () => {
    expect(paragraphRange(sections, { sectionId: 'c', position: 2 }, 10)).toMatchObject({
      last: { sectionId: 'c', position: 3 },
      included: 2,
    });
  });

  it('returns null for an unknown section or a count below 1', () => {
    expect(paragraphRange(sections, { sectionId: 'x', position: 0 }, 3)).toBeNull();
    expect(paragraphRange(sections, { sectionId: 'a', position: 0 }, 0)).toBeNull();
  });
});

describe('inRange and overlapWithSection', () => {
  const range = paragraphRange(sections, { sectionId: 'a', position: 2 }, 4)!;

  it('marks exactly the paragraphs in the range', () => {
    expect(inRange(sections, range, { sectionId: 'a', position: 1 })).toBe(false);
    expect(inRange(sections, range, { sectionId: 'a', position: 2 })).toBe(true);
    expect(inRange(sections, range, { sectionId: 'b', position: 1 })).toBe(true);
    expect(inRange(sections, range, { sectionId: 'c', position: 0 })).toBe(true);
    expect(inRange(sections, range, { sectionId: 'c', position: 1 })).toBe(false);
  });

  it('counts how much of each section the range covers', () => {
    expect(sections.map((s) => overlapWithSection(sections, range, s.id))).toEqual([1, 2, 1]);
  });
});

describe('paragraphNumber', () => {
  it('uses the section order and a 1-based position', () => {
    expect(paragraphNumber(sections, { sectionId: 'c', position: 2 })).toBe('5.3');
  });
});
