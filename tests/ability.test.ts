import { describe, expect, it } from 'vitest';

import { defineAbilityFor } from '~/authorisation/ability';
import { ROLE_VALUES, type UserRole } from '~/utils/constants';

const abilityFor = (role: UserRole) => defineAbilityFor({ role });

// ─── Glossary ────────────────────────────────────────────────────────────────

describe('defineAbilityFor — Glossary', () => {
  // Replacing the glossary deletes every entry, so this is the gate the replace route leans on.
  it('grants Delete to admin only', () => {
    expect(abilityFor('admin').can('Delete', 'Glossary')).toBe(true);

    for (const role of ROLE_VALUES.filter((r) => r !== 'admin')) {
      expect(abilityFor(role).can('Delete', 'Glossary'), `${role} must not delete the glossary`).toBe(false);
    }
  });

  it('grants Update to admin, editor, leader and manager', () => {
    const allowed: UserRole[] = ['admin', 'editor', 'leader', 'manager'];

    for (const role of ROLE_VALUES) {
      expect(abilityFor(role).can('Update', 'Glossary'), role).toBe(allowed.includes(role));
    }
  });

  // Create is what gates bulk import, so manager holds it alongside Read DataManagement.
  it('grants Create to admin and manager', () => {
    const allowed: UserRole[] = ['admin', 'manager'];

    for (const role of ROLE_VALUES) {
      expect(abilityFor(role).can('Create', 'Glossary'), role).toBe(allowed.includes(role));
    }
  });

  // Exporting the whole glossary — both download routes enforce this, not just the icon.
  it('grants Download to admin and manager', () => {
    const allowed: UserRole[] = ['admin', 'manager'];

    for (const role of ROLE_VALUES) {
      expect(abilityFor(role).can('Download', 'Glossary'), role).toBe(allowed.includes(role));
    }
  });
});

// ─── Menu-driving abilities ──────────────────────────────────────────────────

describe('defineAbilityFor — abilities the sidebar reads', () => {
  it('grants Read DataManagement to admin and manager', () => {
    const allowed: UserRole[] = ['admin', 'manager'];

    for (const role of ROLE_VALUES) {
      expect(abilityFor(role).can('Read', 'DataManagement'), role).toBe(allowed.includes(role));
    }
  });

  it('grants Read Administration to admin only', () => {
    for (const role of ROLE_VALUES) {
      expect(abilityFor(role).can('Read', 'Administration'), role).toBe(role === 'admin');
    }
  });

  // A role that can open the Data Management menu but can't write the glossary would find the
  // section visible and useless — which is exactly why manager holds Create Glossary.
  it('gives every role that can reach Data Management a usable glossary tool', () => {
    for (const role of ROLE_VALUES) {
      const ability = abilityFor(role);
      if (ability.can('Read', 'DataManagement')) {
        expect(ability.can('Create', 'Glossary'), `${role} can open Data Management but cannot import`).toBe(true);
      }
    }
  });
});

// ─── Regression: reader is the least-privileged role ─────────────────────────

describe('defineAbilityFor — reader', () => {
  it('grants a reader no glossary or data-management access at all', () => {
    const reader = abilityFor('reader');

    expect(reader.can('Create', 'Glossary')).toBe(false);
    expect(reader.can('Update', 'Glossary')).toBe(false);
    expect(reader.can('Delete', 'Glossary')).toBe(false);
    expect(reader.can('Download', 'Glossary')).toBe(false);
    expect(reader.can('Read', 'DataManagement')).toBe(false);
    expect(reader.can('Read', 'Administration')).toBe(false);
  });
});
