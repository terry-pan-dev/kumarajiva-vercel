import type * as DrizzleOrm from 'drizzle-orm';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ImportContext, ImportProject } from '~/services/file.server';
import type { ExcelTranslationRow } from '~/services/file.service';

import { replaceSectionData as replaceSectionDataWith, selectImportContext } from '~/services/file.server';

// Paragraph metadata (`<document key>.<field>` columns) through the section
// import: merged into matched paragraphs, set on inserts, and never creating a
// paragraph on its own.

// ─── Fixture documents ───────────────────────────────────────────────────────
// Origin T262 (section s-origin), translation EN (s-target) and reference BDK
// (s-bdk), all named and at order 1.

type Existing = {
  id: string;
  order: number;
  passageKey: string | null;
  searchId: string | null;
  metadata: Record<string, string> | null;
};

const mocks = vi.hoisted(() => {
  const existingBySection = new Map<string, Existing[]>();
  const updates: { id: string; data: Record<string, unknown> }[] = [];
  const inserts: Record<string, unknown>[] = [];

  const tx = {
    query: {
      paragraphsTableNew: {
        // The import's `where` is a callback; run it with stand-ins that hand
        // back the section id it asks for.
        findMany: vi.fn(async ({ where }: { where: (p: unknown, ops: unknown) => unknown }) => {
          const sectionId = where(
            { sectionId: 'sectionId', order: 'order' },
            { eq: (_: unknown, v: unknown) => v, and: (a: unknown) => a, gte: () => null },
          ) as string;
          return existingBySection.get(sectionId) ?? [];
        }),
      },
    },
    update: vi.fn(() => ({
      set: (data: Record<string, unknown>) => ({
        where: async (cond: { id: string }) => {
          updates.push({ id: cond.id, data });
        },
      }),
    })),
    insert: vi.fn(() => ({
      values: async (rows: Record<string, unknown>[]) => {
        inserts.push(...rows);
      },
    })),
  };

  return {
    existingBySection,
    updates,
    inserts,
    db: { transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)) },
    saveParagraphsToAlgolia: vi.fn(async (_: Record<string, unknown>[]) => undefined),
    updateParagraphsToAlgolia: vi.fn(async (_: { searchId: string; data: Record<string, unknown> }[]) => undefined),
  };
});

// `eq(column, id)` only feeds the mocked update's `where`, so make it carry the id.
vi.mock('drizzle-orm', async (importOriginal) => ({
  ...(await importOriginal<typeof DrizzleOrm>()),
  eq: (_: unknown, id: unknown) => ({ id }),
}));
vi.mock('~/lib/db.server', () => ({ getDb: () => mocks.db }));
vi.mock('~/services/paragraph.service', () => ({ readParagraphsByRollIdForLanguage: vi.fn() }));
vi.mock('~/services/search.server', () => ({
  saveParagraphsToAlgolia: mocks.saveParagraphsToAlgolia,
  updateParagraphsToAlgolia: mocks.updateParagraphsToAlgolia,
}));
vi.mock('~/services/project.crud', () => ({ DbProjects: { findForImport: vi.fn() } }));
vi.mock('~/services/text.service', () => ({ readParagraphsBySectionId: vi.fn() }));

const doc = (id: string, key: string) => ({ id, key, title: key, language: 'chinese' as const });
const section = (id: string) => ({ id, title: 'Chapter 1', order: 1 });

// Rebuilt per test so a test can unname a counterpart section.
let context: ImportContext;

const replaceSectionData = (rows: ExcelTranslationRow[]) => replaceSectionDataWith(rows, context, 'user');

const row = (overrides: Partial<ExcelTranslationRow>): ExcelTranslationRow => ({
  origin: '',
  target: null,
  passageKey: null,
  references: [],
  metadata: [],
  ...overrides,
});

const page = (documentKey: string, value: string) => ({ documentKey, field: 'page', value });

const updateOf = (id: string) => mocks.updates.find((u) => u.id === id)?.data;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updates.length = 0;
  mocks.inserts.length = 0;
  context = {
    projectId: 'project',
    passageKeyPrefix: 'T262',
    origin: { document: doc('d-origin', 'T262'), section: { ...section('s-origin'), title: '序品' } },
    target: { document: doc('d-target', 'EN'), section: section('s-target') },
    references: [{ document: doc('d-bdk', 'BDK'), section: section('s-bdk') }],
  };
  mocks.existingBySection.clear();
  mocks.existingBySection.set('s-origin', [
    { id: 'o1', order: 1, passageKey: 'k.1', searchId: 'so1', metadata: null },
    { id: 'o2', order: 2, passageKey: 'k.2', searchId: 'so2', metadata: null },
  ]);
  mocks.existingBySection.set('s-bdk', [
    { id: 'b1', order: 1, passageKey: 'k.1', searchId: 'sb1', metadata: { page: '3', other: 'x' } },
  ]);
});

describe('replaceSectionData — paragraph metadata', () => {
  it('a page-only file updates the existing paragraph, keeping its other fields and its content', async () => {
    const result = await replaceSectionData([row({ passageKey: 'k.1', metadata: [page('BDK', '14')] })]);

    expect(result.success).toBe(true);
    expect(updateOf('b1')).toEqual({ metadata: { page: '14', other: 'x' }, updatedBy: 'user' });
    expect(mocks.inserts).toHaveLength(0);
  });

  it('an empty page cell clears the page', async () => {
    await replaceSectionData([row({ passageKey: 'k.1', metadata: [page('BDK', '')] })]);
    expect(updateOf('b1')).toEqual({ metadata: { other: 'x' }, updatedBy: 'user' });
  });

  it('clearing the last field stores null', async () => {
    mocks.existingBySection.set('s-bdk', [
      { id: 'b1', order: 1, passageKey: 'k.1', searchId: 'sb1', metadata: { page: '3' } },
    ]);
    await replaceSectionData([row({ passageKey: 'k.1', metadata: [page('BDK', '')] })]);
    expect(updateOf('b1')).toEqual({ metadata: null, updatedBy: 'user' });
  });

  it('a page with no paragraph to attach to is skipped and reported, not inserted', async () => {
    const result = await replaceSectionData([
      row({ passageKey: 'k.1', metadata: [page('BDK', '14')] }),
      row({ passageKey: 'k.2', metadata: [page('BDK', '15')] }),
    ]);

    expect(result.success).toBe(true);
    expect(mocks.inserts).toHaveLength(0);
    expect(result.message).toContain('BDK: 1 row had metadata but no paragraph');
  });

  it('content without a metadata column leaves stored metadata untouched', async () => {
    await replaceSectionData([
      row({ passageKey: 'k.1', references: [{ sutraName: 'BDK', content: 'Thus have I heard' }] }),
    ]);
    const data = updateOf('b1');
    expect(data).toMatchObject({ content: 'Thus have I heard' });
    expect(data).not.toHaveProperty('metadata');
  });

  it('a new paragraph is inserted with its page, and the search index gets no metadata', async () => {
    await replaceSectionData([
      row({
        passageKey: 'k.2',
        references: [{ sutraName: 'BDK', content: 'At that time' }],
        metadata: [page('BDK', '15')],
      }),
    ]);

    expect(mocks.inserts).toHaveLength(1);
    expect(mocks.inserts[0]).toMatchObject({ sectionId: 's-bdk', passageKey: 'k.2', metadata: { page: '15' } });
    const indexed = mocks.saveParagraphsToAlgolia.mock.calls[0][0];
    expect(indexed[0]).not.toHaveProperty('metadata');
  });

  it('origin content and page update together; only the content goes to search', async () => {
    await replaceSectionData([row({ passageKey: 'k.1', origin: '如是我聞', metadata: [page('T262', '1c')] })]);

    expect(updateOf('o1')).toMatchObject({ content: '如是我聞', metadata: { page: '1c' } });
    const indexed = mocks.updateParagraphsToAlgolia.mock.calls[0][0];
    expect(indexed).toHaveLength(1);
    expect(indexed[0].data).toMatchObject({ content: '如是我聞' });
    expect(indexed[0].data).not.toHaveProperty('metadata');
  });

  it('a page-only update sends nothing to search', async () => {
    await replaceSectionData([row({ passageKey: 'k.1', metadata: [page('BDK', '14')] })]);
    expect(mocks.updateParagraphsToAlgolia).toHaveBeenCalledWith([]);
  });

  it('aligns page-only rows by position when there is no passage_key column', async () => {
    await replaceSectionData([row({ metadata: [page('BDK', '14')] })]);
    expect(updateOf('b1')).toEqual({ metadata: { page: '14', other: 'x' }, updatedBy: 'user' });
  });

  it('translation metadata without a named translation section is skipped, not fatal', async () => {
    context.target.section = null;
    const result = await replaceSectionData([
      row({ passageKey: 'k.1', origin: '如是我聞', metadata: [page('EN', '1')] }),
    ]);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Skipped column(s): "EN"');
    expect(updateOf('o1')).toMatchObject({ content: '如是我聞' });
  });
});

describe('selectImportContext', () => {
  // Only the fields selectImportContext reads; the rest of each row is irrelevant here.
  const sec = (id: string, order: number, title: string | null = `Section ${order}`) => ({ id, order, title });
  const project = {
    id: 'project',
    workId: 'w',
    work: { passageKeyPrefix: 'T279' },
    sourceDocument: { ...doc('d-origin', 'T279'), sections: [sec('s-o1', 1), sec('s-o2', 2)] },
    targetDocument: { ...doc('d-target', 'EN'), sections: [sec('s-t1', 1)] },
    references: [{ document: { ...doc('d-bdk', 'BDK'), sections: [sec('s-b2', 2), sec('s-b1', 1)] } }],
  } as unknown as ImportProject;

  it("matches every counterpart section by the origin section's order", () => {
    const context = selectImportContext(project, 's-o1');

    expect(context).toMatchObject({
      projectId: 'project',
      passageKeyPrefix: 'T279',
      origin: { document: { id: 'd-origin' }, section: { id: 's-o1', order: 1 } },
      target: { document: { id: 'd-target' }, section: { id: 's-t1', title: 'Section 1' } },
      references: [{ document: { id: 'd-bdk', key: 'BDK' }, section: { id: 's-b1' } }],
    });
  });

  it('a counterpart that does not exist yet is null, not an error', () => {
    const context = selectImportContext(project, 's-o2');
    expect(context?.target.section).toBeNull();
    expect(context?.references[0].section).toMatchObject({ id: 's-b2' });
  });

  it("a section outside the project's source document resolves to nothing", () => {
    expect(selectImportContext(project, 's-t1')).toBeNull();
    expect(selectImportContext(project, 'unknown')).toBeNull();
  });

  it('falls back to the work id when the work has no passage key prefix', () => {
    const noPrefix = { ...project, work: { passageKeyPrefix: null } } as unknown as ImportProject;
    expect(selectImportContext(noPrefix, 's-o1')?.passageKeyPrefix).toBe('w');
  });
});
