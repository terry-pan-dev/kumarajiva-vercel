import { beforeEach, describe, expect, it, vi } from 'vitest';

import { newTranslation } from '~/components/GlossaryForm';
import { action } from '~/routes/_app.glossary._index';

// The glossary page's direct changes (edit form, trash): for the trusted roles only (GlossaryData
// Maintain: tech, admin). Everyone else suggests or flags (docs/plans/glossary-suggestions.md).
// The buttons are hidden from them; these checks are what stop a direct POST. Services mocked.
const mocks = vi.hoisted(() => ({
  assertAuthUser: vi.fn(),
  readGlossariesByIds: vi.fn(),
  trashGlossaryById: vi.fn(),
  updateGlossaryTranslations: vi.fn(),
}));

vi.mock('~/auth.server', () => ({ assertAuthUser: mocks.assertAuthUser }));
vi.mock('~/services', () => ({
  readGlossaries: vi.fn(),
  readGlossariesByIds: mocks.readGlossariesByIds,
  trashGlossaryById: mocks.trashGlossaryById,
  updateGlossaryTranslations: mocks.updateGlossaryTranslations,
}));
vi.mock('~/services/edge.only', () => ({ searchGlossaries: vi.fn() }));

const G = '00000000-0000-4000-8000-00000000000a';
const T = '00000000-0000-4000-8000-0000000000b1';

const post = (fields: Record<string, string>) =>
  action({
    request: new Request('http://localhost/glossary?index', { method: 'POST', body: new URLSearchParams(fields) }),
    params: {},
    context: {},
  });

const trash = () => post({ intent: 'delete-glossary', glossaryId: G });
const edit = () =>
  post({
    kind: 'edit',
    data: JSON.stringify({
      id: G,
      sourceTerm: '般若',
      phonetic: '',
      baseTranslationIds: [T],
      translations: [{ ...newTranslation(), id: T, term: 'insight' }],
    }),
  });

const writes = () => mocks.trashGlossaryById.mock.calls.length + mocks.updateGlossaryTranslations.mock.calls.length;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readGlossariesByIds.mockResolvedValue([{ id: G, translations: [{ id: T }] }]);
  mocks.trashGlossaryById.mockResolvedValue({ term: '般若', deletedRecords: 1 });
  mocks.updateGlossaryTranslations.mockResolvedValue({ id: G });
});

describe('direct changes on the glossary page', () => {
  it.each(['leader', 'manager', 'editor', 'assistant', 'reader'])('refuses %s with 403', async (role) => {
    mocks.assertAuthUser.mockResolvedValue({ id: 'u1', role });
    expect((await edit()).status).toBe(403);
    expect((await trash()).status).toBe(403);
    expect(writes()).toBe(0);
  });

  it.each(['tech', 'admin'])('lets %s edit and trash', async (role) => {
    mocks.assertAuthUser.mockResolvedValue({ id: 'u1', role });
    expect((await edit()).status).toBe(200);
    expect((await trash()).status).toBe(200);
    expect(mocks.updateGlossaryTranslations).toHaveBeenCalledTimes(1);
    expect(mocks.trashGlossaryById).toHaveBeenCalledWith(G, 'u1');
  });
});
