import { describe, expect, it, vi } from 'vitest';

import { DbContributors, DbSections } from '~/services/text.crud';

// Mock the DB so module-level getDb() doesn't attempt a real connection.
// The guard clauses under test return before touching the db object.
vi.mock('~/lib/db.server', () => ({ getDb: () => ({}) }));

// ─── DbSections.findByIds ─────────────────────────────────────────────────────

describe('DbSections.findByIds', () => {
  it('returns [] immediately for an empty ids array', async () => {
    const result = await DbSections.findByIds([]);
    expect(result).toEqual([]);
  });
});

// ─── DbSections.createMany ────────────────────────────────────────────────────

describe('DbSections.createMany', () => {
  it('returns [] immediately for an empty sections array', async () => {
    const result = await DbSections.createMany([]);
    expect(result).toEqual([]);
  });
});

// ─── DbContributors.createMany ────────────────────────────────────────────────

describe('DbContributors.createMany', () => {
  it('returns [] immediately for an empty contributors array', async () => {
    const result = await DbContributors.createMany([]);
    expect(result).toEqual([]);
  });
});
