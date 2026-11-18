import { describe, expect, it } from 'vitest';

import { groupPendingForEntry, pendingSuggestionView } from '~/services/suggestion.view';

// What the glossary page shows of a pending suggestion: proposals of new terms and translations
// in full; changes to stored translations only as "under review"; the note to its submitter alone.
const names = new Map([
  ['u1', 'ana'],
  ['u2', 'bo'],
]);

const row = (over: Partial<Parameters<typeof pendingSuggestionView>[0]> = {}) => ({
  id: 's1',
  status: 'pending' as const,
  targetKind: 'glossary_translation' as const,
  action: 'create' as const,
  glossaryId: 'g1',
  translationId: null,
  proposed: { term: 'awakening', language: 'english' },
  note: 'from the Lotus, ch. 2',
  createdAt: new Date('2026-11-17T10:00:00Z'),
  createdBy: 'u1',
  enrichedAt: null,
  reviewedAt: null,
  ...over,
});

describe('pendingSuggestionView', () => {
  it('shows the submitter their note, and lets them edit until someone works on it', () => {
    const view = pendingSuggestionView(row(), 'u1', names);
    expect(view).toMatchObject({
      mine: true,
      editable: true,
      note: 'from the Lotus, ch. 2',
      submitter: 'ana',
      createdAt: '2026-11-17T10:00:00.000Z',
      proposed: { term: 'awakening' },
    });
    expect(pendingSuggestionView(row({ enrichedAt: new Date() }), 'u1', names).editable).toBe(false);
    expect(pendingSuggestionView(row({ reviewedAt: new Date() }), 'u1', names).editable).toBe(false);
  });

  it('hides the note from everyone else, who can’t edit it', () => {
    const view = pendingSuggestionView(row(), 'u2', names);
    expect(view).toMatchObject({ mine: false, editable: false, note: null, submitter: 'ana' });
  });

  it.each(['flag', 'edit'] as const)('shows nothing of a %s’s values: only that it is under review', (action) => {
    const view = pendingSuggestionView(row({ action, translationId: 't1', proposed: { term: 'secret' } }), 'u2', names);
    expect(view.proposed).toBeNull();
    expect(view.note).toBeNull();
  });

  it('names an unknown submitter generically', () => {
    expect(pendingSuggestionView(row({ createdBy: 'gone' }), 'u1', names).submitter).toBe('someone');
  });
});

describe('groupPendingForEntry', () => {
  it('splits new translations from changes, by translation', () => {
    const views = [
      pendingSuggestionView(row({ id: 'a' }), 'u1', names),
      pendingSuggestionView(row({ id: 'b', action: 'flag', translationId: 't1' }), 'u1', names),
      pendingSuggestionView(row({ id: 'c', action: 'edit', translationId: 't1' }), 'u1', names),
      pendingSuggestionView(row({ id: 'd', action: 'flag', translationId: 't2' }), 'u1', names),
      pendingSuggestionView(row({ id: 'e', targetKind: 'glossary_term' }), 'u1', names),
    ];
    const { newTranslations, changesByTranslation } = groupPendingForEntry(views);
    expect(newTranslations.map((v) => v.id)).toEqual(['a']);
    expect(changesByTranslation.get('t1')?.map((v) => v.id)).toEqual(['b', 'c']);
    expect(changesByTranslation.get('t2')?.map((v) => v.id)).toEqual(['d']);
  });
});
