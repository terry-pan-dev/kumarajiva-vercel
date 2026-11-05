import { beforeEach, describe, expect, it, vi } from 'vitest';

import { action, loader } from '~/routes/_app.data.search-index';

// The Search Index page's server side: only admins reach it, the loader never writes, and only
// the confirmed action rebuilds. The rebuild itself is tested in search.server.test.ts; here it
// is mocked. Permissions are the real role table (admin: Administrate, manager: Maintain only).
const mocks = vi.hoisted(() => ({
  assertAuthUser: vi.fn(),
  rebuildParagraphIndex: vi.fn(),
}));

vi.mock('~/auth.server', () => ({ assertAuthUser: mocks.assertAuthUser }));
vi.mock('~/services/search.server', () => ({ rebuildParagraphIndex: mocks.rebuildParagraphIndex }));

const report = (apply: boolean) => ({
  applied: apply,
  rows: 3,
  records: 3,
  withoutSearchId: [],
  duplicateSearchId: [],
  recordsBefore: 5,
  settingsChanged: ['typoTolerance'],
  liveSettings: { advancedSyntax: true },
});

const url = 'http://localhost/data/search-index';
const runLoader = () => loader({ request: new Request(url), params: {}, context: {} });
const runAction = (fields: Record<string, string>) =>
  action({ request: new Request(url, { method: 'POST', body: new URLSearchParams(fields) }), params: {}, context: {} });

// What a loader/action returned or threw, as { status, location, body }.
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
    // not JSON (a redirect)
  }
  return { status: response.status, location: response.headers.get('Location'), body };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertAuthUser.mockResolvedValue({ id: 'u1', role: 'admin' });
  mocks.rebuildParagraphIndex.mockImplementation(async ({ apply }: { apply: boolean }) => report(apply));
});

describe('loader', () => {
  it('sends a non-admin back to /data without reading anything', async () => {
    mocks.assertAuthUser.mockResolvedValue({ id: 'u1', role: 'manager' });
    expect(await outcome(runLoader)).toMatchObject({ status: 302, location: '/data' });
    expect(mocks.rebuildParagraphIndex).not.toHaveBeenCalled();
  });

  it('sends a signed-out visitor to /login', async () => {
    mocks.assertAuthUser.mockResolvedValue(null);
    expect(await outcome(runLoader)).toMatchObject({ status: 302, location: '/login' });
  });

  it('shows a dry run — never a rebuild — with the configured settings', async () => {
    const { status, body } = await outcome(runLoader);
    expect(status).toBe(200);
    expect(mocks.rebuildParagraphIndex).toHaveBeenCalledWith({ apply: false });
    expect(body).toMatchObject({
      indexName: 'paragraphs',
      report: { applied: false, recordsBefore: 5, records: 3 },
      configured: { searchableAttributes: ['content'], typoTolerance: 'min', advancedSyntax: true },
    });
  });
});

describe('action', () => {
  it('refuses a non-admin without rebuilding', async () => {
    mocks.assertAuthUser.mockResolvedValue({ id: 'u1', role: 'manager' });
    expect(await outcome(() => runAction({ intent: 'rebuild' }))).toMatchObject({ status: 302, location: '/data' });
    expect(mocks.rebuildParagraphIndex).not.toHaveBeenCalled();
  });

  it('rebuilds on the rebuild intent', async () => {
    const { status, body } = await outcome(() => runAction({ intent: 'rebuild' }));
    expect(status).toBe(200);
    expect(mocks.rebuildParagraphIndex).toHaveBeenCalledWith({ apply: true });
    expect(body).toMatchObject({ success: true });
  });

  it('does nothing for any other intent', async () => {
    const { status } = await outcome(() => runAction({ intent: 'something-else' }));
    expect(status).toBe(400);
    expect(mocks.rebuildParagraphIndex).not.toHaveBeenCalled();
  });

  it('reports a failed rebuild instead of throwing', async () => {
    mocks.rebuildParagraphIndex.mockRejectedValue(new Error('Algolia unreachable'));
    const { status, body } = await outcome(() => runAction({ intent: 'rebuild' }));
    expect(status).toBe(500);
    expect(body).toMatchObject({ success: false, message: expect.stringContaining('Algolia unreachable') });
  });
});
