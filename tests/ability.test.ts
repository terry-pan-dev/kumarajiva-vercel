import { describe, expect, it } from 'vitest';

import { defineAbilityFor } from '~/authorisation/ability';
import { ROLE_VALUES, type UserRole } from '~/utils/constants';

const abilityFor = (role: UserRole) => defineAbilityFor({ role });

const LEVELS = ['Update', 'Maintain', 'Administrate'] as const;
const SUBJECTS = ['Glossary', 'GlossaryData', 'Translation', 'TranslationData', 'Users'] as const;

// ─── Levels are cumulative ───────────────────────────────────────────────────

describe('defineAbilityFor — levels', () => {
  // Check sites ask only for the level an operation needs, so a higher level has to pass every
  // check a lower one does, or an admin would be locked out of editing.
  it('grants every lower level along with a higher one', () => {
    for (const role of ROLE_VALUES) {
      const ability = abilityFor(role);
      for (const subject of SUBJECTS) {
        if (ability.can('Administrate', subject)) {
          expect(ability.can('Maintain', subject), `${role} ${subject}`).toBe(true);
        }
        if (ability.can('Maintain', subject)) {
          expect(ability.can('Update', subject), `${role} ${subject}`).toBe(true);
        }
      }
    }
  });

  it('does not grant a higher level along with a lower one', () => {
    const editor = abilityFor('editor');

    expect(editor.can('Update', 'Glossary')).toBe(true);
    expect(editor.can('Maintain', 'Glossary')).toBe(false);
    expect(editor.can('Administrate', 'Glossary')).toBe(false);
  });
});

// ─── Destructive and account-level access ────────────────────────────────────

describe('defineAbilityFor — Administrate', () => {
  // Replacing the glossary, purging the trash, hard deletes and the inspectors all lean on this.
  it('grants Administrate on every subject to admin only', () => {
    for (const subject of SUBJECTS) {
      for (const role of ROLE_VALUES) {
        expect(abilityFor(role).can('Administrate', subject), `${role} ${subject}`).toBe(role === 'admin');
      }
    }
  });

  // Users is the subject that decides who holds everything else. The admin pages ask for
  // Administrate; tech holds Maintain, which no check asks for yet.
  it('grants any level on Users only to admin and tech', () => {
    for (const role of ROLE_VALUES.filter((r) => r !== 'admin' && r !== 'tech')) {
      for (const level of LEVELS) {
        expect(abilityFor(role).can(level, 'Users'), `${role} ${level}`).toBe(false);
      }
    }
  });
});

// ─── Everyday pages versus Data Management ───────────────────────────────────

describe('defineAbilityFor — data subjects', () => {
  // Leaders add glossary entries and edit origin text, but are kept out of the import and
  // cleanup tools.
  it('lets leader maintain the everyday pages without any Data Management access', () => {
    const leader = abilityFor('leader');

    expect(leader.can('Maintain', 'Glossary')).toBe(true);
    expect(leader.can('Maintain', 'Translation')).toBe(true);
    for (const level of LEVELS) {
      expect(leader.can(level, 'GlossaryData'), level).toBe(false);
      expect(leader.can(level, 'TranslationData'), level).toBe(false);
    }
  });

  it('lets manager maintain translation data but gives it nothing on the glossary', () => {
    const manager = abilityFor('manager');

    expect(manager.can('Update', 'Glossary')).toBe(true);
    expect(manager.can('Maintain', 'Translation')).toBe(true);
    expect(manager.can('Maintain', 'TranslationData')).toBe(true);
    for (const level of LEVELS) {
      expect(manager.can(level, 'GlossaryData'), level).toBe(false);
    }
  });

  // Tech does maintenance on everything, but nothing irreversible and no user management.
  it('lets tech maintain every subject without administrating any', () => {
    const tech = abilityFor('tech');

    for (const subject of SUBJECTS) {
      expect(tech.can('Maintain', subject), subject).toBe(true);
      expect(tech.can('Administrate', subject), subject).toBe(false);
    }
  });
});

// ─── Regression: the least-privileged roles ──────────────────────────────────

describe('defineAbilityFor — least-privileged roles', () => {
  it('grants a reader no level on any subject', () => {
    const reader = abilityFor('reader');
    for (const subject of SUBJECTS) {
      for (const level of LEVELS) {
        expect(reader.can(level, subject), `${level} ${subject}`).toBe(false);
      }
    }
  });

  it('lets an assistant edit translations and nothing else', () => {
    const assistant = abilityFor('assistant');
    for (const subject of SUBJECTS) {
      for (const level of LEVELS) {
        const allowed = subject === 'Translation' && level === 'Update';
        expect(assistant.can(level, subject), `${level} ${subject}`).toBe(allowed);
      }
    }
  });
});
