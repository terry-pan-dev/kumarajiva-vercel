import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertAuthUser } from '~/auth.server';

// assertAuthUser re-reads the session's user on every request and ends the session when the
// user has changed in a way that matters. A user's languages no longer matter (nothing reads
// them); their role still does.
const mocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(),
  readUserByEmail: vi.fn(),
  destroySession: vi.fn(),
}));

vi.mock('remix-auth', () => ({
  Authenticator: class {
    isAuthenticated = mocks.isAuthenticated;
    use() {
      return this;
    }
  },
}));
vi.mock('remix-auth-form', () => ({ FormStrategy: class {} }));
vi.mock('remix-auth-google', () => ({ GoogleStrategy: class {} }));
vi.mock('~/services/user.service', () => ({ readUserByEmail: mocks.readUserByEmail }));
vi.mock('~/session.server', () => ({
  sessionStorage: {},
  getSession: vi.fn(async () => ({})),
  destroySession: mocks.destroySession,
}));

const sessionUser = {
  id: 'u1',
  email: 'ananda@example.org',
  role: 'editor',
  originLang: 'chinese',
  targetLang: 'english',
  avatar: 'old.png',
  password: 'hash',
};
const request = new Request('http://localhost/translation');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isAuthenticated.mockResolvedValue(sessionUser);
});

describe('assertAuthUser', () => {
  it('returns the session user, with the latest avatar and no password', async () => {
    mocks.readUserByEmail.mockResolvedValue({ ...sessionUser, avatar: 'new.png' });
    expect(await assertAuthUser(request)).toMatchObject({ id: 'u1', role: 'editor', avatar: 'new.png', password: '' });
    expect(mocks.destroySession).not.toHaveBeenCalled();
  });

  it('keeps the session when only the stored languages differ', async () => {
    mocks.readUserByEmail.mockResolvedValue({ ...sessionUser, originLang: 'sanskrit', targetLang: 'indonesian' });
    expect(await assertAuthUser(request)).toMatchObject({ id: 'u1' });
    expect(mocks.destroySession).not.toHaveBeenCalled();
  });

  it('ends the session when the role has changed', async () => {
    mocks.readUserByEmail.mockResolvedValue({ ...sessionUser, role: 'reader' });
    expect(await assertAuthUser(request)).toBeUndefined();
    expect(mocks.destroySession).toHaveBeenCalled();
  });

  it('ends the session when the user no longer exists', async () => {
    mocks.readUserByEmail.mockResolvedValue(undefined);
    expect(await assertAuthUser(request)).toBeUndefined();
    expect(mocks.destroySession).toHaveBeenCalled();
  });
});
