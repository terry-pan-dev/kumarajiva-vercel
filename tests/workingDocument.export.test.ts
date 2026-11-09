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

  it('shows page and paragraph numbers', () => {
    expect(defaults.showPages).toBe(true);
    expect(defaults.showNumbers).toBe(true);
  });
});

describe('reconcileWorkingDocumentFormat', () => {
  it('keeps a saved page setting, and turns pages on for formats saved before the setting existed', () => {
    expect(reconcileWorkingDocumentFormat({ ...defaults, showPages: false }, defaults).showPages).toBe(false);
    expect(reconcileWorkingDocumentFormat({ blocks: defaults.blocks }, defaults).showPages).toBe(true);
  });

  it('keeps a saved paragraph number setting, and turns numbers on for formats saved before it existed', () => {
    expect(reconcileWorkingDocumentFormat({ ...defaults, showNumbers: false }, defaults).showNumbers).toBe(false);
    expect(reconcileWorkingDocumentFormat({ blocks: defaults.blocks, showPages: false }, defaults).showNumbers).toBe(
      true,
    );
  });

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

  it('keeps extra and hidden entries for the same text', () => {
    const [source, target, refA, refB] = defaults.blocks;
    const saved: WorkingDocumentFormat = {
      blocks: [source, { ...target, visible: false }, refA, refB, { ...source, id: 'source#2', size: 14 }],
    };

    const result = reconcileWorkingDocumentFormat(saved, defaults);

    expect(result.blocks.map((b) => b.id)).toEqual([
      'source',
      'target',
      'reference:ref-a',
      'reference:ref-b',
      'source#2',
    ]);
    expect(result.blocks[1].visible).toBe(false);
    expect(result.blocks[4].size).toBe(14);
  });
});
