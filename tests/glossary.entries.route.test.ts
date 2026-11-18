import { beforeEach, describe, expect, it, vi } from 'vitest';

import { newTranslation } from '~/components/GlossaryForm';
import { action, loader } from '~/routes/_app.data.glossary.entries';
import { TranslationListError } from '~/services/glossary.diff';

// The Data Management entry editor: direct changes to the glossary (edit, trash), for the
// trusted roles only (GlossaryData Maintain: tech, admin). The glossary page has no direct tools;
// everyone else suggests there (docs/plans/glossary-suggestions.md). Services are mocked;
// permissions are the real role table.
const mocks = vi.hoisted(() => ({
  assertAuthUser: vi.fn(),
  readGlossariesByIds: vi.fn(),
  searchGlossaryEntriesForEditing: vi.fn(),
  trashGlossaryById: vi.fn(),
  updateGlossaryTranslations: vi.fn(),
}));

vi.mock('~/auth.server', () => ({ assertAuthUser: mocks.assertAuthUser }));
vi.mock('~/services/glossary.service', () => ({
  readGlossariesByIds: mocks.readGlossariesByIds,
  searchGlossaryEntriesForEditing: mocks.searchGlossaryEntriesForEditing,
  trashGlossaryById: mocks.trashGlossaryById,
  updateGlossaryTranslations: mocks.updateGlossaryTranslations,
}));

const G = '00000000-0000-4000-8000-00000000000a';
const T = '00000000-0000-4000-8000-0000000000b1';
const URL_BASE = 'http://localhost/data/glossary/entries';

const runLoader = (search = '') => loader({ request: new Request(`${URL_BASE}${search}`), params: {}, context: {} });
const post = (fields: Record<string, string>) =>
  action({
    request: new Request(URL_BASE, { method: 'POST', body: new URLSearchParams(fields) }),
    params: {},
    context: {},
  });
const trash = () => post({ intent: 'delete-glossary', glossaryId: G });
const edit = () =>
  post({
    intent: 'edit',
    data: JSON.stringify({
      id: G,
      sourceTerm: '般若',
      phonetic: '',
      baseTranslationIds: [T],
      translations: [{ ...newTranslation(), id: T, term: 'insight' }],
    }),
  });

// What a loader returned or threw, as { status, location }.
async function outcome(run: () => Promise<Response>) {
  try {
    const response = await run();
    return { status: response.status, location: response.headers.get('Location') };
  } catch (thrown) {
    if (!(thrown instanceof Response)) throw thrown;
    return { status: thrown.status, location: thrown.headers.get('Location') };
  }
}

const writes = () => mocks.trashGlossaryById.mock.calls.length + mocks.updateGlossaryTranslations.mock.calls.length;
const as = (role: string) => mocks.assertAuthUser.mockResolvedValue({ id: `u-${role}`, role });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readGlossariesByIds.mockResolvedValue([{ id: G, sourceTerm: '般若', translations: [{ id: T }] }]);
  mocks.searchGlossaryEntriesForEditing.mockResolvedValue([]);
  mocks.trashGlossaryById.mockResolvedValue({ term: '般若', deletedRecords: 1 });
  mocks.updateGlossaryTranslations.mockResolvedValue({ id: G });
});

describe('loader', () => {
  it.each(['leader', 'manager', 'editor', 'assistant', 'reader'])('sends %s back to /data', async (role) => {
    as(role);
    expect(await outcome(() => runLoader('?q=般若'))).toMatchObject({ status: 302, location: '/data' });
    expect(mocks.searchGlossaryEntriesForEditing).not.toHaveBeenCalled();
  });

  it('searches live entries and opens the chosen one, for tech', async () => {
    as('tech');
    const response = await runLoader(`?q=%E8%88%AC&id=${G}`);
    expect(mocks.searchGlossaryEntriesForEditing).toHaveBeenCalledWith('般', 50);
    expect(mocks.readGlossariesByIds).toHaveBeenCalledWith([G]);
    expect(await response.json()).toMatchObject({ query: '般', selectedId: G, selected: { id: G } });
  });

  it('does not search without a query', async () => {
    as('admin');
    expect(await (await runLoader()).json()).toMatchObject({ query: '', results: [], selected: null });
    expect(mocks.searchGlossaryEntriesForEditing).not.toHaveBeenCalled();
  });
});

describe('action', () => {
  it.each(['leader', 'manager', 'editor', 'assistant', 'reader'])('refuses %s with 403', async (role) => {
    as(role);
    expect((await edit()).status).toBe(403);
    expect((await trash()).status).toBe(403);
    expect(writes()).toBe(0);
  });

  it.each(['tech', 'admin'])('lets %s save an edit and trash an entry', async (role) => {
    as(role);
    const saved = await edit();
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ success: true });
    const call = mocks.updateGlossaryTranslations.mock.calls[0][0];
    expect(call).toMatchObject({ id: G, basis: [T], author: null, discussion: null });
    expect(call.translations[0]).toMatchObject({ id: T, term: 'insight', updatedBy: `u-${role}` });
    expect((await trash()).status).toBe(200);
    expect(mocks.trashGlossaryById).toHaveBeenCalledWith(G, `u-${role}`);
  });

  it('reports an entry gone (404) and a list changed meanwhile (409)', async () => {
    as('tech');
    mocks.trashGlossaryById.mockResolvedValue(null);
    expect((await trash()).status).toBe(404);
    mocks.updateGlossaryTranslations.mockRejectedValue(new TranslationListError('changed'));
    const stale = await edit();
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ success: false, error: expect.any(String) });
  });

  it('refuses an unknown request', async () => {
    as('admin');
    expect((await post({ intent: 'nope' })).status).toBe(400);
    expect(writes()).toBe(0);
  });
});
