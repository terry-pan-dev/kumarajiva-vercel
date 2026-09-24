import { describe, expect, it, vi } from 'vitest';

import { defaultWorkingDocumentFormat, reconcileWorkingDocumentFormat } from '~/services/workingDocument.export';
import { type WorkingDocumentFormat } from '~/validations/workingDocument.validation';

// The service's reads go through the DB; the format logic under test does not.
vi.mock('~/lib/db.server', () => ({ getDb: () => ({}) }));
vi.mock('~/services/search.server', () => ({}));

const project = {
  references: [
    { documentId: 'ref-a', document: { key: 'btts', title: 'BTTS rendering' } },
    { documentId: 'ref-b', document: { key: null, title: 'commentary' } },
  ],
};

const defaults = defaultWorkingDocumentFormat(project);

// ─── Format ──────────────────────────────────────────────────────────────────

describe('defaultWorkingDocumentFormat', () => {
  it('labels source and translation, and references by capitalised document key or title', () => {
    expect(defaults.blocks.map((b) => [b.key, b.label, b.font])).toEqual([
      ['source', 'Source', 'Noto Serif TC'],
      ['target', 'Translation', 'Times New Roman'],
      ['reference:ref-a', 'Btts', 'Times New Roman'],
      ['reference:ref-b', 'Commentary', 'Times New Roman'],
    ]);
  });
});

describe('reconcileWorkingDocumentFormat', () => {
  it('uses the defaults when nothing is saved', () => {
    expect(reconcileWorkingDocumentFormat(undefined, defaults)).toEqual(defaults);
  });

  it('keeps saved order and look, drops removed references and appends new ones', () => {
    const [source, target, refA] = defaults.blocks;
    const saved: WorkingDocumentFormat = {
      blocks: [{ ...target, font: 'Palatino Linotype' }, source, { ...refA, key: 'reference:gone' }, refA, source],
    };

    const result = reconcileWorkingDocumentFormat(saved, defaults);

    expect(result.blocks.map((b) => b.key)).toEqual(['target', 'source', 'reference:ref-a', 'reference:ref-b']);
    expect(result.blocks[0].font).toBe('Palatino Linotype');
  });
});
