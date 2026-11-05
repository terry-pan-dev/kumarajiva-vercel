import { describe, expect, it, vi } from 'vitest';

import { DbContributors, DbParagraphsNew, DbSections } from '~/services/text.crud';

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

// ─── DbParagraphsNew search reads ─────────────────────────────────────────────
// An empty IN () is invalid SQL, so these must answer [] before building a query.

describe('DbParagraphsNew.findByIdsWithRelations', () => {
  it('returns [] immediately for an empty ids array', async () => {
    expect(await DbParagraphsNew.findByIdsWithRelations([])).toEqual([]);
  });
});

describe('DbParagraphsNew.findAlignedCandidates', () => {
  it('returns [] immediately when there are no works or no passage keys', async () => {
    expect(await DbParagraphsNew.findAlignedCandidates([], ['k1'])).toEqual([]);
    expect(await DbParagraphsNew.findAlignedCandidates(['w1'], [])).toEqual([]);
  });
});
