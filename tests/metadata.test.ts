import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { metadataField, metadataSection } from '~/utils/metadata';

// ─── Metadata ────────────────────────────────────────────────────────────────

describe('metadata helpers', () => {
  const metadata = { workingDocument: { lastExportedParagraphId: 'p-9', format: 'not a format' }, other: 3 };

  it('reads a section, treating missing or non-object sections as empty', () => {
    expect(metadataSection(metadata, 'workingDocument')).toEqual(metadata.workingDocument);
    expect(metadataSection(metadata, 'other')).toEqual({});
    expect(metadataSection(null, 'workingDocument')).toEqual({});
  });

  it('reads a validated field, and undefined when missing or invalid', () => {
    expect(metadataField(metadata, 'workingDocument', 'lastExportedParagraphId', z.string())).toBe('p-9');
    expect(metadataField(metadata, 'workingDocument', 'format', z.object({}))).toBeUndefined();
    expect(metadataField(undefined, 'workingDocument', 'lastExportedParagraphId', z.string())).toBeUndefined();
  });
});
