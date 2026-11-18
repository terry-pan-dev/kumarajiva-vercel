import { describe, expect, it } from 'vitest';

import { type GlossaryTranslation } from '~/services/glossary.types';
import {
  applyEdit,
  assertSubmitterMayEdit,
  assertSubmitterMayWithdraw,
  canEnrich,
  canFinalize,
  canReview,
  changedFields,
  snapshotOf,
  staleFields,
  SuggestionError,
} from '~/services/suggestion.rules';
import { ROLE_VALUES, type UserRole } from '~/utils/constants';

// Who may do what to a suggestion (the real role table), and how an edit compares with the
// translation it changes.
const as = (role: UserRole) => ({ id: `u-${role}`, role });
const rolesWhere = (allowed: (user: ReturnType<typeof as>) => boolean) =>
  ROLE_VALUES.filter((r) => allowed(as(r))).sort();

const codeOf = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    if (error instanceof SuggestionError) return error.code;
    throw error;
  }
  return 'ok';
};

describe('permissions', () => {
  it('lets tech and admin enrich', () => {
    expect(rolesWhere(canEnrich)).toEqual(['admin', 'tech']);
  });

  it('lets only admin finalize', () => {
    expect(rolesWhere(canFinalize)).toEqual(['admin']);
  });

  it('lets leaders and admins review, not readers or assistants', () => {
    const reviewers = rolesWhere(canReview);
    expect(reviewers).toEqual(expect.arrayContaining(['admin', 'leader']));
    expect(reviewers).not.toContain('reader');
    expect(reviewers).not.toContain('assistant');
    // Editors and managers still hold Glossary Update until the permission change of step 3
    // (docs/plans/glossary-suggestions.md), which leaves exactly ['admin', 'leader'].
  });
});

describe('the submitter’s own suggestion', () => {
  const mine = { status: 'pending' as const, createdBy: 'u-editor', enrichedAt: null, reviewedAt: null };
  const editor = as('editor');

  it('can be edited while nobody has worked on it', () => {
    expect(codeOf(() => assertSubmitterMayEdit(mine, editor))).toBe('ok');
  });

  it('is locked once enriched or reviewed, but can still be withdrawn', () => {
    expect(codeOf(() => assertSubmitterMayEdit({ ...mine, enrichedAt: new Date() }, editor))).toBe('locked');
    expect(codeOf(() => assertSubmitterMayEdit({ ...mine, reviewedAt: new Date() }, editor))).toBe('locked');
    expect(codeOf(() => assertSubmitterMayWithdraw({ ...mine, reviewedAt: new Date() }, editor))).toBe('ok');
  });

  it('cannot be edited or withdrawn by anyone else, or once it is no longer pending', () => {
    expect(codeOf(() => assertSubmitterMayEdit(mine, as('admin')))).toBe('forbidden');
    expect(codeOf(() => assertSubmitterMayWithdraw(mine, as('admin')))).toBe('forbidden');
    expect(codeOf(() => assertSubmitterMayWithdraw({ ...mine, status: 'accepted' }, editor))).toBe('not-pending');
  });
});

const stored: GlossaryTranslation = {
  id: 't1',
  term: 'wisdom',
  language: 'english',
  sourceName: '金剛經',
  volume: '1',
  sourceText: '般若',
  targetText: null,
  author: '',
  partOfSpeech: null,
  phonetic: null,
  discussion: 'kept',
  updatedBy: 'someone',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('snapshots and edits', () => {
  it('snapshots the content fields only, absent and blank as they are stored', () => {
    const snapshot = snapshotOf(stored);
    expect(snapshot).toMatchObject({ term: 'wisdom', targetText: null, author: '', discussion: 'kept' });
    expect(snapshot).not.toHaveProperty('updatedBy');
    expect(snapshot).not.toHaveProperty('id');
  });

  it('counts a field as changed only when it differs, blank and null being the same', () => {
    const base = snapshotOf(stored);
    expect(changedFields(base, { term: 'insight', author: null, sourceName: '金剛經' })).toEqual(['term']);
  });

  it('reports as stale only the changed fields that also changed in storage', () => {
    const base = snapshotOf(stored);
    const current = { ...base, term: 'prajñā', volume: '2' };
    expect(staleFields(base, current, ['term', 'author'])).toEqual(['term']);
  });

  it('applies only the changed fields, as the finalizer’s edit', () => {
    const next = applyEdit(
      stored,
      { term: 'insight', author: 'Kumārajīva', volume: '3' },
      ['term', 'author'],
      'admin-1',
    );
    expect(next).toMatchObject({ id: 't1', term: 'insight', author: 'Kumārajīva', volume: '1', discussion: 'kept' });
    expect(next.updatedBy).toBe('admin-1');
  });

  it('stores a cleared source or section as blank, and never clears the rendering', () => {
    const next = applyEdit(
      stored,
      { sourceName: null, volume: null, term: null },
      ['sourceName', 'volume', 'term'],
      'a',
    );
    expect(next).toMatchObject({ sourceName: '', volume: '', term: 'wisdom' });
  });
});
