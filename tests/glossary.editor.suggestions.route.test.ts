import { beforeEach, describe, expect, it, vi } from 'vitest';

import { action, loader } from '~/routes/_app.data.glossary.editor.suggestions';
import { SuggestionError } from '~/services/suggestion.rules';

// The Data Management suggestions queue: for tech and admin (GlossaryData Maintain). It reads the
// filters, hands each intent to its service operation, and turns a SuggestionError into its
// status, message and code. The service is mocked (it holds the finalize-only rules, tested in
// suggestion.service.test.ts); permissions at the gate are the real role table.
const mocks = vi.hoisted(() => ({
  assertAuthUser: vi.fn(),
  listSuggestionQueue: vi.fn(),
  readSuggestionForQueue: vi.fn(),
  enrichSuggestion: vi.fn(),
  setSuggestionReady: vi.fn(),
  acceptSuggestion: vi.fn(),
  rejectSuggestion: vi.fn(),
  dismissFlag: vi.fn(),
  mergeIntoTerm: vi.fn(),
  flagToEdit: vi.fn(),
  removeFlaggedTranslation: vi.fn(),
}));

vi.mock('~/auth.server', () => ({ assertAuthUser: mocks.assertAuthUser }));
vi.mock('~/services/glossary.service', () => ({
  readGlossariesByIds: vi.fn(async (ids: string[]) => ids.map((id) => ({ id, sourceTerm: '般若' }))),
}));
vi.mock('~/services/suggestion.service', () => {
  const { assertAuthUser: _, ...service } = mocks;
  return service;
});

const S = '00000000-0000-4000-8000-0000000000c1';
const G = '00000000-0000-4000-8000-00000000000a';
const URL_BASE = 'http://localhost/data/glossary/editor/suggestions';

const as = (role: string) => mocks.assertAuthUser.mockResolvedValue({ id: `u-${role}`, role });
const runLoader = (search = '') => loader({ request: new Request(`${URL_BASE}${search}`), params: {}, context: {} });
const post = (body: unknown) =>
  action({
    request: new Request(URL_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: {},
    context: {},
  });

async function outcome(run: () => Promise<Response>) {
  try {
    const response = await run();
    return { status: response.status, location: response.headers.get('Location') };
  } catch (thrown) {
    if (!(thrown instanceof Response)) throw thrown;
    return { status: thrown.status, location: thrown.headers.get('Location') };
  }
}

const writes = () =>
  [
    mocks.enrichSuggestion,
    mocks.setSuggestionReady,
    mocks.acceptSuggestion,
    mocks.rejectSuggestion,
    mocks.dismissFlag,
    mocks.mergeIntoTerm,
    mocks.flagToEdit,
    mocks.removeFlaggedTranslation,
  ].reduce((sum, mock) => sum + mock.mock.calls.length, 0);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listSuggestionQueue.mockResolvedValue({ items: [], total: 0 });
  mocks.readSuggestionForQueue.mockResolvedValue(null);
});

describe('loader', () => {
  it.each(['leader', 'manager', 'editor', 'assistant', 'reader'])('sends %s back to /data', async (role) => {
    as(role);
    expect(await outcome(() => runLoader())).toMatchObject({ status: 302, location: '/data' });
    expect(mocks.listSuggestionQueue).not.toHaveBeenCalled();
  });

  it('lists pending suggestions by default, first page, for tech', async () => {
    as('tech');
    const data = await (await runLoader()).json();
    expect(mocks.listSuggestionQueue).toHaveBeenCalledWith({
      status: 'pending',
      kind: undefined,
      ready: undefined,
      createdBy: undefined,
      glossaryId: undefined,
      limit: 50,
      offset: 0,
    });
    expect(data).toMatchObject({
      canFinalize: false,
      filters: { status: 'pending', kind: 'all', ready: 'any', entry: null },
    });
  });

  it('applies the filters and opens the chosen suggestion; admins may finalize', async () => {
    as('admin');
    mocks.readSuggestionForQueue.mockResolvedValue({ suggestion: { id: S } });
    const data = await (await runLoader(`?status=all&kind=change-request&mine=1&ready=yes&page=3&id=${S}`)).json();
    expect(mocks.listSuggestionQueue).toHaveBeenCalledWith({
      status: undefined,
      kind: 'change-request',
      ready: true,
      createdBy: 'u-admin',
      glossaryId: undefined,
      limit: 50,
      offset: 100,
    });
    expect(mocks.readSuggestionForQueue).toHaveBeenCalledWith(S);
    expect(data).toMatchObject({ canFinalize: true, selectedId: S, selected: { suggestion: { id: S } } });
  });

  it('shows one entry’s suggestions, naming the entry', async () => {
    as('tech');
    const data = await (await runLoader(`?glossary=${G}&status=all`)).json();
    expect(mocks.listSuggestionQueue.mock.calls[0][0]).toMatchObject({ glossaryId: G, status: undefined });
    expect(data.filters.entry).toEqual({ id: G, sourceTerm: '般若' });
  });

  it('ignores unknown filter values', async () => {
    as('tech');
    await runLoader('?status=bogus&kind=delete&page=-2&glossary=nope');
    expect(mocks.listSuggestionQueue.mock.calls[0][0]).toMatchObject({
      status: 'pending',
      kind: undefined,
      offset: 0,
      glossaryId: undefined,
    });
  });
});

describe('action', () => {
  it.each(['leader', 'manager', 'editor', 'assistant', 'reader'])('refuses %s with 403', async (role) => {
    as(role);
    expect((await post({ intent: 'enrich', id: S, proposed: {} })).status).toBe(403);
    expect(writes()).toBe(0);
  });

  it.each([
    [{ intent: 'enrich', id: S, proposed: { term: 'x' } }, 'enrichSuggestion', [S, { term: 'x' }]],
    [{ intent: 'ready', id: S, ready: true }, 'setSuggestionReady', [S, true]],
    [
      { intent: 'accept', id: S, note: 'ok', confirmStale: true },
      'acceptSuggestion',
      [S, { note: 'ok', confirmStale: true }],
    ],
    [{ intent: 'reject', id: S, note: 'no' }, 'rejectSuggestion', [S, 'no']],
    [{ intent: 'dismiss', id: S, note: 'fine' }, 'dismissFlag', [S, 'fine']],
    [{ intent: 'merge', id: S, glossaryId: G }, 'mergeIntoTerm', [S, G]],
    [{ intent: 'flag-to-edit', id: S, proposed: { volume: '2' } }, 'flagToEdit', [S, { volume: '2' }]],
    [{ intent: 'remove-translation', id: S, note: 'dup' }, 'removeFlaggedTranslation', [S, 'dup']],
  ] as const)('hands %o to %s, as the user', async (body, operation, args) => {
    as('admin');
    const response = await post(body);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, intent: body.intent });
    expect(mocks[operation]).toHaveBeenCalledWith({ id: 'u-admin', role: 'admin' }, ...args);
    expect(writes()).toBe(1);
  });

  it.each([
    ['an unknown intent', { intent: 'review', id: S }],
    ['an id that is not a uuid', { intent: 'reject', id: 'x' }],
    ['a merge without its entry', { intent: 'merge', id: S }],
    ['a ready mark that is not a boolean', { intent: 'ready', id: S, ready: 'yes' }],
  ])('refuses %s with 400', async (_, body) => {
    as('admin');
    expect((await post(body)).status).toBe(400);
    expect(writes()).toBe(0);
  });

  it('answers a stale edit with 409 and its fields, and an existing headword with its entry', async () => {
    as('admin');
    mocks.acceptSuggestion.mockRejectedValueOnce(new SuggestionError('stale', 'Changed.', { fields: ['term'] }));
    const stale = await post({ intent: 'accept', id: S });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ success: false, intent: 'accept', code: 'stale', fields: ['term'] });
    mocks.acceptSuggestion.mockRejectedValueOnce(new SuggestionError('term-exists', 'There.', { glossaryId: G }));
    expect(await (await post({ intent: 'accept', id: S })).json()).toMatchObject({
      code: 'term-exists',
      glossaryId: G,
    });
  });

  it('answers tech trying to finalize with the service’s 403', async () => {
    as('tech');
    mocks.rejectSuggestion.mockRejectedValue(new SuggestionError('forbidden', 'Not allowed.'));
    expect((await post({ intent: 'reject', id: S })).status).toBe(403);
  });

  it('lets any other error through', async () => {
    as('admin');
    mocks.rejectSuggestion.mockRejectedValue(new Error('db down'));
    await expect(post({ intent: 'reject', id: S })).rejects.toThrow('db down');
  });
});
