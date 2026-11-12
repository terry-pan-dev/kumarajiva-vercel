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
      ['number', '', 'Times New Roman'],
      ['source', 'Source', 'Noto Serif TC'],
      ['target', 'Translation', 'Times New Roman'],
      ['reference:ref-a', 'Btts', 'Times New Roman'],
      ['reference:ref-b', 'Commentary', 'Times New Roman'],
    ]);
  });

  it('labels the paragraph number before the texts, and shows page numbers', () => {
    expect(defaults.blocks.map((b) => b.label)[0]).toBe('');
    expect(defaults.blocks[0]).toMatchObject({ size: 8, color: '#808080', visible: true });
    expect(defaults.showPages).toBe(true);
  });
});

describe('reconcileWorkingDocumentFormat', () => {
  it('keeps a saved page setting, and turns pages on for formats saved before the setting existed', () => {
    expect(reconcileWorkingDocumentFormat({ ...defaults, showPages: false }, defaults).showPages).toBe(false);
    expect(reconcileWorkingDocumentFormat({ blocks: defaults.blocks }, defaults).showPages).toBe(true);
  });

  it('gives formats saved before the number entry one first, shown or hidden as their old switch said', () => {
    const [, ...texts] = defaults.blocks;
    const shown = reconcileWorkingDocumentFormat({ blocks: texts }, defaults);
    const hidden = reconcileWorkingDocumentFormat({ blocks: texts, showNumbers: false }, defaults);

    expect(shown.blocks.map((b) => b.key)[0]).toBe('number');
    expect(shown.blocks[0].visible).toBe(true);
    expect(hidden.blocks[0].visible).toBe(false);
    expect(hidden).not.toHaveProperty('showNumbers');
  });

  it('keeps a saved number entry where it is, ignoring the old switch', () => {
    const [num, ...texts] = defaults.blocks;
    const result = reconcileWorkingDocumentFormat(
      { blocks: [...texts, { ...num, label: '§' }], showNumbers: false },
      defaults,
    );

    expect(result.blocks.map((b) => b.key).at(-1)).toBe('number');
    expect(result.blocks.at(-1)).toMatchObject({ label: '§', visible: true });
  });

  it('uses the defaults when nothing is saved', () => {
    expect(reconcileWorkingDocumentFormat(undefined, defaults)).toEqual(defaults);
  });

  it('keeps saved order and look, drops removed references and appends new ones', () => {
    const [num, source, target, refA] = defaults.blocks;
    const saved: WorkingDocumentFormat = {
      blocks: [{ ...target, font: 'Palatino Linotype' }, source, num, { ...refA, key: 'reference:gone' }, refA, source],
    };

    const result = reconcileWorkingDocumentFormat(saved, defaults);

    expect(result.blocks.map((b) => b.key)).toEqual([
      'target',
      'source',
      'number',
      'reference:ref-a',
      'reference:ref-b',
    ]);
    expect(result.blocks[0].font).toBe('Palatino Linotype');
  });

  it('keeps extra and hidden entries for the same text', () => {
    const [num, source, target, refA, refB] = defaults.blocks;
    const saved: WorkingDocumentFormat = {
      blocks: [num, source, { ...target, visible: false }, refA, refB, { ...source, id: 'source#2', size: 14 }],
    };

    const result = reconcileWorkingDocumentFormat(saved, defaults);

    expect(result.blocks.map((b) => b.id)).toEqual([
      'number',
      'source',
      'target',
      'reference:ref-a',
      'reference:ref-b',
      'source#2',
    ]);
    expect(result.blocks[2].visible).toBe(false);
    expect(result.blocks[5].size).toBe(14);
  });
});
