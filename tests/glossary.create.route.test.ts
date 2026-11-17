import { beforeEach, describe, expect, it, vi } from 'vitest';

import { newTranslation } from '~/components/GlossaryForm';
import { action } from '~/routes/_app.glossary';

// The Create Glossary Entry action's permission check: the create button is hidden from roles
// without Maintain on Glossary, and this is what stops a direct POST. Services are mocked;
// permissions are the real role table (leader, tech, admin: Maintain; editor, manager: Update).
const mocks = vi.hoisted(() => ({
  assertAuthUser: vi.fn(),
  findByTermsIncludingTrash: vi.fn(),
  createGlossaryAndIndexInAlgolia: vi.fn(),
  reviveTrashedGlossary: vi.fn(),
}));

vi.mock('~/auth.server', () => ({ assertAuthUser: mocks.assertAuthUser }));
vi.mock('~/services/glossary.store', () => ({
  GlossaryStore: { findByTermsIncludingTrash: mocks.findByTermsIncludingTrash },
}));
vi.mock('~/services/glossary.service', () => ({
  createGlossaryAndIndexInAlgolia: mocks.createGlossaryAndIndexInAlgolia,
  reviveTrashedGlossary: mocks.reviveTrashedGlossary,
}));
vi.mock('~/services/user.service', () => ({ readUsers: vi.fn() }));

// What the create form posts: the headword and one translation, the rest blank as the form sends it.
const entry = {
  sourceTerm: '般若',
  phonetic: 'bō rě',
  translations: [{ ...newTranslation(), term: 'prajñā' }],
};

const runAction = () =>
  action({
    request: new Request('http://localhost/glossary', {
      method: 'POST',
      body: new URLSearchParams({ data: JSON.stringify(entry) }),
    }),
    params: {},
    context: {},
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findByTermsIncludingTrash.mockResolvedValue([]);
  mocks.createGlossaryAndIndexInAlgolia.mockResolvedValue({ id: 'g1' });
});

describe('create action', () => {
  it.each(['editor', 'manager', 'assistant', 'reader'])('refuses %s with 403 and writes nothing', async (role) => {
    mocks.assertAuthUser.mockResolvedValue({ id: 'u1', role });
    const response = await runAction();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false });
    expect(mocks.findByTermsIncludingTrash).not.toHaveBeenCalled();
    expect(mocks.createGlossaryAndIndexInAlgolia).not.toHaveBeenCalled();
    expect(mocks.reviveTrashedGlossary).not.toHaveBeenCalled();
  });

  it.each(['leader', 'tech', 'admin'])('lets %s create a term', async (role) => {
    mocks.assertAuthUser.mockResolvedValue({ id: 'u1', role });
    const response = await runAction();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true });
    expect(mocks.createGlossaryAndIndexInAlgolia).toHaveBeenCalledTimes(1);
  });
});
