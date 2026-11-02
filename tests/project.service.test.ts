import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SectionContextProject } from '~/services/project.service';

import { selectSectionContext } from '~/services/project.service';
import { resolveTranslationTarget } from '~/services/text.service';

// A section's context within one project: its documents and each one's
// counterpart section, matched by order. The project query is mocked; what's
// under test is how the section and its counterparts are picked out.

const mocks = vi.hoisted(() => ({ findForSectionContext: vi.fn() }));

vi.mock('~/lib/db.server', () => ({ getDb: () => ({}) }));
vi.mock('~/services/search.server', () => ({}));
vi.mock('~/services/project.crud', () => ({ DbProjects: mocks, DbProjectReferences: {} }));

// ─── Fixtures ────────────────────────────────────────────────────────────────
// Only the fields the context reads; the rest of each row is irrelevant here.

const doc = (id: string, key: string) => ({ id, key, title: key, language: 'chinese' as const });
const sec = (id: string, order: number, title: string | null = `Section ${order}`) => ({ id, order, title });

const project = {
  id: 'project',
  workId: 'w',
  work: { passageKeyPrefix: 'T279' },
  sourceDocument: { ...doc('d-origin', 'T279'), sections: [sec('s-o1', 1), sec('s-o2', 2)] },
  targetDocument: { ...doc('d-target', 'EN'), sections: [sec('s-t1', 1)] },
  references: [{ document: { ...doc('d-bdk', 'BDK'), sections: [sec('s-b2', 2), sec('s-b1', 1)] } }],
} as unknown as SectionContextProject;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findForSectionContext.mockResolvedValue(project);
});

describe('selectSectionContext', () => {
  it("matches every counterpart section by the origin section's order", () => {
    const context = selectSectionContext(project, 's-o1');

    expect(context).toMatchObject({
      projectId: 'project',
      passageKeyPrefix: 'T279',
      origin: { document: { id: 'd-origin' }, section: { id: 's-o1', order: 1 } },
      target: { document: { id: 'd-target' }, section: { id: 's-t1', title: 'Section 1' } },
      references: [{ document: { id: 'd-bdk', key: 'BDK' }, section: { id: 's-b1' } }],
    });
  });

  it('a counterpart that does not exist yet is null, not an error', () => {
    const context = selectSectionContext(project, 's-o2');
    expect(context?.target.section).toBeNull();
    expect(context?.references[0].section).toMatchObject({ id: 's-b2' });
  });

  it("a section outside the project's source document resolves to nothing", () => {
    expect(selectSectionContext(project, 's-t1')).toBeNull();
    expect(selectSectionContext(project, 'unknown')).toBeNull();
  });

  it('falls back to the work id when the work has no passage key prefix', () => {
    const noPrefix = { ...project, work: { passageKeyPrefix: null } } as unknown as SectionContextProject;
    expect(selectSectionContext(noPrefix, 's-o1')?.passageKeyPrefix).toBe('w');
  });
});

describe('resolveTranslationTarget', () => {
  it("writes to the URL project's target document, in the counterpart section", async () => {
    await expect(resolveTranslationTarget('project', 's-o1')).resolves.toEqual({
      ok: true,
      targetDocumentId: 'd-target',
      targetSectionId: 's-t1',
    });
    expect(mocks.findForSectionContext).toHaveBeenCalledWith('project');
  });

  it('reports a missing counterpart section rather than creating one', async () => {
    await expect(resolveTranslationTarget('project', 's-o2')).resolves.toEqual({
      ok: false,
      reason: 'no-target-section',
    });
  });

  it('an unknown project, or a section from another document, is not found', async () => {
    await expect(resolveTranslationTarget('project', 's-t1')).resolves.toEqual({
      ok: false,
      reason: 'section-not-found',
    });
    mocks.findForSectionContext.mockResolvedValue(undefined);
    await expect(resolveTranslationTarget('other', 's-o1')).resolves.toEqual({
      ok: false,
      reason: 'section-not-found',
    });
  });
});
