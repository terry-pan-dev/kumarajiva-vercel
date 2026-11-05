import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createUser } from '~/services/user.service';
import { createUserSchema, updateUserSchema } from '~/validations/user.validation';

const db = vi.hoisted(() => {
  const inserted: Record<string, unknown>[] = [];
  return {
    inserted,
    client: {
      insert: vi.fn(() => ({
        values: (row: Record<string, unknown>) => {
          inserted.push(row);
          return { returning: async () => [row] };
        },
      })),
    },
  };
});

vi.mock('~/lib/db.server', () => ({ getDb: () => db.client }));

const newUser = {
  username: 'Ananda',
  email: 'ananda@example.org',
  teamId: '00000000-0000-4000-8000-000000000001',
  role: 'editor' as const,
  password: 'hashed',
  createdBy: 'admin',
  updatedBy: 'admin',
};

beforeEach(() => {
  db.inserted.length = 0;
});

describe('createUser', () => {
  it('inserts the user as given, with no language columns', async () => {
    await createUser(newUser);
    expect(db.inserted).toEqual([newUser]);
  });
});

describe('user validation', () => {
  it('creates a user without any language', () => {
    expect(createUserSchema.safeParse({ ...newUser, password: 'pw' }).success).toBe(true);
  });

  it('no longer carries languages through, even if a stale form sends them', () => {
    const parsed = createUserSchema.parse({ ...newUser, password: 'pw', originLang: 'chinese', targetLang: 'english' });
    expect(parsed).not.toHaveProperty('originLang');
    expect(parsed).not.toHaveProperty('targetLang');
    const update = updateUserSchema.parse({ id: newUser.teamId, targetLang: 'sanskrit' });
    expect(update).not.toHaveProperty('targetLang');
  });
});
