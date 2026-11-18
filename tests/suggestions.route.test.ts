import { beforeEach, describe, expect, it, vi } from 'vitest';

import { action, loader } from '~/routes/_app.resources.suggestions';
import { SuggestionError } from '~/services/suggestion.rules';

// The suggestion endpoint: anyone signed in may submit, edit or withdraw their own, and read an
// entry's pending suggestions; it checks the request's shape, hands it to the service, and turns
// a SuggestionError into its status and code. The service is mocked.
const mocks = vi.hoisted(() => ({
  assertAuthUser: vi.fn(),
  submitSuggestion: vi.fn(),
  editOwnSuggestion: vi.fn(),
  withdrawSuggestion: vi.fn(),
  readPendingSuggestionViews: vi.fn(),
}));

vi.mock('~/auth.server', () => ({ assertAuthUser: mocks.assertAuthUser }));
vi.mock('~/services/suggestion.service', () => ({
  submitSuggestion: mocks.submitSuggestion,
  editOwnSuggestion: mocks.editOwnSuggestion,
  withdrawSuggestion: mocks.withdrawSuggestion,
  readPendingSuggestionViews: mocks.readPendingSuggestionViews,
}));

const G = '00000000-0000-4000-8000-00000000000a';
const T = '00000000-0000-4000-8000-0000000000b1';
const S = '00000000-0000-4000-8000-0000000000c1';

const post = (body: unknown) =>
  action({
    request: new Request('http://localhost/resources/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    params: {},
    context: {},
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertAuthUser.mockResolvedValue({ id: 'u1', role: 'reader' });
  mocks.submitSuggestion.mockResolvedValue({ id: 's1' });
  mocks.editOwnSuggestion.mockResolvedValue({ id: S });
  mocks.withdrawSuggestion.mockResolvedValue({ id: S });
  mocks.readPendingSuggestionViews.mockResolvedValue([{ id: S }]);
});

const get = (query: string) =>
  loader({ request: new Request(`http://localhost/resources/suggestions${query}`), params: {}, context: {} });

describe('submitting', () => {
  it('hands a reader’s new term to the service, as that user', async () => {
    const proposed = { sourceTerm: '菩提', translation: { term: 'awakening' } };
    const response = await post({ intent: 'submit', kind: 'new-term', proposed, note: 'n' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, suggestion: { id: 's1' } });
    expect(mocks.submitSuggestion).toHaveBeenCalledWith(
      { id: 'u1', role: 'reader' },
      { kind: 'new-term', proposed, note: 'n' },
    );
  });

  it('passes a flag with its ids', async () => {
    await post({ intent: 'submit', kind: 'flag', glossaryId: G, translationId: T, note: 'wrong' });
    expect(mocks.submitSuggestion.mock.calls[0][1]).toEqual({
      kind: 'flag',
      glossaryId: G,
      translationId: T,
      note: 'wrong',
    });
  });

  it.each([
    ['not JSON', '{nope'],
    ['an unknown intent', { intent: 'accept', kind: 'new-term' }],
    ['an unknown kind', { intent: 'submit', kind: 'delete' }],
    ['a translation without its term', { intent: 'submit', kind: 'new-translation', proposed: {} }],
    ['an edit with an id that is not a uuid', { intent: 'submit', kind: 'edit', glossaryId: G, translationId: 'x' }],
  ])('refuses %s with 400, without calling the service', async (_, body) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, code: 'invalid' });
    expect(mocks.submitSuggestion).not.toHaveBeenCalled();
  });
});

describe('errors from the service', () => {
  it('answers term-exists with 409 and the existing entry', async () => {
    mocks.submitSuggestion.mockRejectedValue(new SuggestionError('term-exists', 'Already there.', { glossaryId: G }));
    const response = await post({ intent: 'submit', kind: 'new-term', proposed: {} });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false,
      code: 'term-exists',
      message: 'Already there.',
      glossaryId: G,
    });
  });

  it.each([
    ['invalid', 400],
    ['nothing-changed', 400],
    ['forbidden', 403],
    ['target-gone', 409],
  ] as const)('answers %s with %i', async (code, status) => {
    mocks.submitSuggestion.mockRejectedValue(new SuggestionError(code, 'No.'));
    const response = await post({ intent: 'submit', kind: 'new-term', proposed: {} });
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code });
  });

  it('lets any other error through', async () => {
    mocks.submitSuggestion.mockRejectedValue(new Error('db down'));
    await expect(post({ intent: 'submit', kind: 'new-term', proposed: {} })).rejects.toThrow('db down');
  });
});

describe('the submitter’s own suggestion', () => {
  it('hands an edit to the service with its proposal and note, as that user', async () => {
    const proposed = { term: 'awakening', language: 'english' };
    const response = await post({ intent: 'edit-own', id: S, proposed, note: 'n' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, suggestion: { id: S } });
    expect(mocks.editOwnSuggestion).toHaveBeenCalledWith({ id: 'u1', role: 'reader' }, S, { proposed, note: 'n' });
  });

  it('withdraws, as that user', async () => {
    const response = await post({ intent: 'withdraw', id: S });
    expect(response.status).toBe(200);
    expect(mocks.withdrawSuggestion).toHaveBeenCalledWith({ id: 'u1', role: 'reader' }, S);
    expect(mocks.editOwnSuggestion).not.toHaveBeenCalled();
  });

  it.each(['edit-own', 'withdraw'])('refuses %s without a uuid id', async (intent) => {
    const response = await post({ intent, id: 'x' });
    expect(response.status).toBe(400);
    expect(mocks.editOwnSuggestion).not.toHaveBeenCalled();
    expect(mocks.withdrawSuggestion).not.toHaveBeenCalled();
  });

  it('answers someone else’s suggestion with 403, and a worked-on one with 409', async () => {
    mocks.withdrawSuggestion.mockRejectedValue(new SuggestionError('forbidden', 'Not yours.'));
    expect((await post({ intent: 'withdraw', id: S })).status).toBe(403);
    mocks.editOwnSuggestion.mockRejectedValue(new SuggestionError('locked', 'Worked on.'));
    expect((await post({ intent: 'edit-own', id: S, note: 'n' })).status).toBe(409);
  });
});

describe('reading an entry’s pending suggestions', () => {
  it('answers the views for the signed-in user', async () => {
    const response = await get(`?glossaryId=${G}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, glossaryId: G, suggestions: [{ id: S }] });
    expect(mocks.readPendingSuggestionViews).toHaveBeenCalledWith({ id: 'u1', role: 'reader' }, G);
  });

  it.each(['', '?glossaryId=x'])('refuses %j with 400', async (query) => {
    const response = await get(query);
    expect(response.status).toBe(400);
    expect(mocks.readPendingSuggestionViews).not.toHaveBeenCalled();
  });
});
