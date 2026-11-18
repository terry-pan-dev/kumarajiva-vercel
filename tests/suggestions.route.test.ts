import { beforeEach, describe, expect, it, vi } from 'vitest';

import { action } from '~/routes/_app.resources.suggestions';
import { SuggestionError } from '~/services/suggestion.rules';

// The suggestion endpoint: anyone signed in may submit; it checks the request's shape, hands it
// to the service, and turns a SuggestionError into its status and code. The service is mocked.
const mocks = vi.hoisted(() => ({ assertAuthUser: vi.fn(), submitSuggestion: vi.fn() }));

vi.mock('~/auth.server', () => ({ assertAuthUser: mocks.assertAuthUser }));
vi.mock('~/services/suggestion.service', () => ({ submitSuggestion: mocks.submitSuggestion }));

const G = '00000000-0000-4000-8000-00000000000a';
const T = '00000000-0000-4000-8000-0000000000b1';

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
});

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
