import { beforeEach, describe, expect, it, vi } from 'vitest';

import { action, loader } from '~/routes/_app.data.paragraphs.$projectId.$sectionId';

// The Paragraphs data page's server side: who may see and delete, which rows it loads, and that
// a delete can only reach rows the page shows. Services are mocked; permissions are the real
// role table (manager: Maintain, admin: Administrate, leader: neither on TranslationData).
const mocks = vi.hoisted(() => ({
  assertAuthUser: vi.fn(),
  resolveSectionContext: vi.fn(),
  readParagraphsForDebugBySectionId: vi.fn(),
  getParagraph: vi.fn(),
  deleteParagraph: vi.fn(),
}));

vi.mock('~/auth.server', () => ({ assertAuthUser: mocks.assertAuthUser }));
vi.mock('~/services/project.service', () => ({ resolveSectionContext: mocks.resolveSectionContext }));
vi.mock('~/services/text.service', () => ({
  readParagraphsForDebugBySectionId: mocks.readParagraphsForDebugBySectionId,
  getParagraph: mocks.getParagraph,
  deleteParagraph: mocks.deleteParagraph,
}));

const doc = (id: string, language: 'chinese' | 'english') => ({ id, key: id, title: `Doc ${id}`, language });
const section = (id: string) => ({ id, title: `Section ${id}`, order: 1 });

const contextWith = (targetSection: ReturnType<typeof section> | null) => ({
  projectId: 'p1',
  passageKeyPrefix: 't0279',
  origin: { document: doc('d-src', 'chinese'), section: section('s-src') },
  target: { document: doc('d-tgt', 'english'), section: targetSection },
  references: [],
});

const params = { projectId: 'p1', sectionId: 's-src' };
const get = () => new Request('http://localhost/data/paragraphs/p1/s-src');
const post = (fields: Record<string, string>) =>
  new Request('http://localhost/data/paragraphs/p1/s-src', { method: 'POST', body: new URLSearchParams(fields) });

const runLoader = () => loader({ request: get(), params, context: {} });
const runAction = (fields: Record<string, string>) => action({ request: post(fields), params, context: {} });

// What a loader/action returned or threw, as { status, body }.
async function outcome(run: () => Promise<Response>) {
  let response: Response;
  try {
    response = await run();
  } catch (thrown) {
    if (!(thrown instanceof Response)) throw thrown;
    response = thrown;
  }
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // not JSON (a redirect or plain-text error)
  }
  return { status: response.status, location: response.headers.get('Location'), body };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertAuthUser.mockResolvedValue({ id: 'u1', role: 'admin' });
  mocks.resolveSectionContext.mockResolvedValue(contextWith(section('s-tgt')));
  mocks.readParagraphsForDebugBySectionId.mockImplementation(async (sectionId: string) => [
    { id: `${sectionId}-row`, sectionId },
  ]);
});

// ─── Loader ──────────────────────────────────────────────────────────────────

describe('loader', () => {
  it('sends a role without Maintain on TranslationData back to /data', async () => {
    mocks.assertAuthUser.mockResolvedValue({ id: 'u1', role: 'leader' });
    expect(await outcome(runLoader)).toMatchObject({ status: 302, location: '/data' });
    expect(mocks.resolveSectionContext).not.toHaveBeenCalled();
  });

  it('resolves the section within the project named in the URL', async () => {
    await runLoader();
    expect(mocks.resolveSectionContext).toHaveBeenCalledWith('p1', 's-src');
  });

  it('loads the source section and its translation section', async () => {
    const { status, body } = await outcome(runLoader);
    expect(status).toBe(200);
    expect(mocks.readParagraphsForDebugBySectionId.mock.calls).toEqual([['s-src'], ['s-tgt']]);
    expect(body).toMatchObject({
      projectId: 'p1',
      sourceRows: [{ id: 's-src-row' }],
      targetRows: [{ id: 's-tgt-row' }],
      source: { section: { id: 's-src' } },
      target: { document: { id: 'd-tgt' }, section: { id: 's-tgt' } },
    });
  });

  it('with no translation section yet, loads the source alone', async () => {
    mocks.resolveSectionContext.mockResolvedValue(contextWith(null));
    const { body } = await outcome(runLoader);
    expect(mocks.readParagraphsForDebugBySectionId.mock.calls).toEqual([['s-src']]);
    expect(body).toMatchObject({ targetRows: [], target: { section: null } });
  });

  it('answers 404 for a section that is not in the project', async () => {
    mocks.resolveSectionContext.mockResolvedValue(null);
    expect(await outcome(runLoader)).toMatchObject({ status: 404 });
    expect(mocks.readParagraphsForDebugBySectionId).not.toHaveBeenCalled();
  });

  it('offers deletion to Administrate only', async () => {
    expect((await outcome(runLoader)).body).toMatchObject({ canDelete: true });
    mocks.assertAuthUser.mockResolvedValue({ id: 'u1', role: 'manager' });
    expect((await outcome(runLoader)).body).toMatchObject({ canDelete: false });
  });
});

// ─── Action ──────────────────────────────────────────────────────────────────

describe('action — delete-paragraph', () => {
  const remove = (paragraphId: string) => runAction({ intent: 'delete-paragraph', paragraphId });

  it('refuses a role without Administrate, before touching anything', async () => {
    mocks.assertAuthUser.mockResolvedValue({ id: 'u1', role: 'manager' });
    expect(await outcome(() => remove('x'))).toMatchObject({ status: 403, body: { success: false } });
    expect(mocks.getParagraph).not.toHaveBeenCalled();
    expect(mocks.deleteParagraph).not.toHaveBeenCalled();
  });

  it('deletes a paragraph of the source section', async () => {
    mocks.getParagraph.mockResolvedValue({ id: 'para', sectionId: 's-src' });
    expect(await outcome(() => remove('para'))).toMatchObject({ status: 200, body: { success: true } });
    expect(mocks.deleteParagraph).toHaveBeenCalledWith({ id: 'para' });
  });

  it('deletes a paragraph of the translation section', async () => {
    mocks.getParagraph.mockResolvedValue({ id: 'para', sectionId: 's-tgt' });
    await remove('para');
    expect(mocks.deleteParagraph).toHaveBeenCalledWith({ id: 'para' });
  });

  // A crafted form must not reach rows the page doesn't show.
  it('refuses a paragraph from any other section', async () => {
    mocks.getParagraph.mockResolvedValue({ id: 'para', sectionId: 'elsewhere' });
    expect(await outcome(() => remove('para'))).toMatchObject({ status: 404, body: { success: false } });
    expect(mocks.deleteParagraph).not.toHaveBeenCalled();
  });

  it('with no translation section yet, still deletes source rows and still refuses others', async () => {
    mocks.resolveSectionContext.mockResolvedValue(contextWith(null));
    mocks.getParagraph.mockResolvedValueOnce({ id: 'stray', sectionId: 's-tgt' });
    expect(await outcome(() => remove('stray'))).toMatchObject({ status: 404 });
    expect(mocks.deleteParagraph).not.toHaveBeenCalled();

    mocks.getParagraph.mockResolvedValueOnce({ id: 'para', sectionId: 's-src' });
    expect(await outcome(() => remove('para'))).toMatchObject({ status: 200 });
    expect(mocks.deleteParagraph).toHaveBeenCalledWith({ id: 'para' });
  });

  it('refuses a paragraph that does not exist', async () => {
    mocks.getParagraph.mockResolvedValue(undefined);
    expect(await outcome(() => remove('gone'))).toMatchObject({ status: 404 });
    expect(mocks.deleteParagraph).not.toHaveBeenCalled();
  });

  it('refuses when the section is not in the project', async () => {
    mocks.resolveSectionContext.mockResolvedValue(null);
    mocks.getParagraph.mockResolvedValue({ id: 'para', sectionId: 's-src' });
    await remove('para');
    expect(mocks.deleteParagraph).not.toHaveBeenCalled();
  });

  it('reports a failed delete as a 500', async () => {
    mocks.getParagraph.mockResolvedValue({ id: 'para', sectionId: 's-src' });
    mocks.deleteParagraph.mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await outcome(() => remove('para'))).toMatchObject({ status: 500, body: { success: false } });
  });

  it('rejects any other intent', async () => {
    expect(await outcome(() => runAction({ intent: 'drop-everything' }))).toMatchObject({ status: 400 });
    expect(mocks.deleteParagraph).not.toHaveBeenCalled();
  });
});
