import { AbilityBuilder, createAliasResolver, PureAbility } from '@casl/ability';

import type { UserRole } from '~/utils/constants';

import { type ReadUser } from '~/drizzle/schema';

// Levels, not CRUD verbs. Each is cumulative — see resolveAction below.
//   Update       — change values that already exist: edit a translation or a glossary entry, comment.
//   Maintain     — anything additive or undoable: single inserts, soft deletes to the trash and
//                  restores, editing origin text, and — on the data subjects — imports that merge,
//                  downloads and setting up projects, works and documents.
//   Administrate — anything irreversible or wholesale: replacing the glossary, purging the
//                  trash, hard deletes in the data pages, and the raw-data inspectors.
// Merely being signed in is enough to read, so there is no Read level.
type Actions = 'Update' | 'Maintain' | 'Administrate';
// Glossary and Translation are the everyday pages; GlossaryData and TranslationData are the same
// data seen through Data Management, which is kept apart so that people who add glossary entries
// or edit origin text need not be handed the import and cleanup tools as well.
type Subjects = 'Glossary' | 'GlossaryData' | 'Translation' | 'TranslationData' | 'Users';

export type AppAbility = PureAbility<[Actions, Subjects]>;

// Holding a level grants every level beneath it, so a check asks only for the level the
// operation needs and never has to list the roles above it.
const resolveAction = createAliasResolver({
  Administrate: 'Maintain',
  Maintain: 'Update',
});

// The one place roles meet permissions. Each role holds at most one level per subject;
// a subject left out means read-only.
const LEVELS: Record<UserRole, Partial<Record<Subjects, Actions>>> = {
  admin: {
    Glossary: 'Administrate',
    GlossaryData: 'Administrate',
    Translation: 'Administrate',
    TranslationData: 'Administrate',
    Users: 'Administrate',
  },
  tech: {
    Glossary: 'Maintain',
    GlossaryData: 'Maintain',
    Translation: 'Maintain',
    TranslationData: 'Maintain',
    Users: 'Maintain',
  },
  manager: { Glossary: 'Update', Translation: 'Maintain', TranslationData: 'Maintain' },
  leader: { Glossary: 'Maintain', Translation: 'Maintain' },
  editor: { Glossary: 'Update', Translation: 'Update' },
  assistant: { Translation: 'Update' },
  reader: {},
};

// TEMPORARY: the glossary is frozen while its translations move from the JSON column to the
// glossary_translations table (docs/plans/glossary-refactor.md, PR 4 release). Edits made by
// the old code during the switch would be lost, so only admins (who run the release) keep any
// glossary level; everyone else reads. Set back to false, or revert this change, once the
// switch is verified on prod (step 5).
export const GLOSSARY_FROZEN = true;

const GLOSSARY_SUBJECTS: ReadonlySet<Subjects> = new Set<Subjects>(['Glossary', 'GlossaryData']);

// Only the role is consulted, so callers may pass anything role-shaped — a full ReadUser,
// or a bare { role } recovered from a loader. `glossaryFrozen` is for tests; the app uses the
// constant.
export const defineAbilityFor = (
  user: Pick<ReadUser, 'role'>,
  { glossaryFrozen = GLOSSARY_FROZEN }: { glossaryFrozen?: boolean } = {},
): AppAbility => {
  const { can, build } = new AbilityBuilder<AppAbility>(PureAbility);
  const levels = LEVELS[user.role as UserRole] ?? {};
  for (const [subject, level] of Object.entries(levels) as [Subjects, Actions][]) {
    if (glossaryFrozen && user.role !== 'admin' && GLOSSARY_SUBJECTS.has(subject)) continue;
    can(level, subject);
  }
  return build({ resolveAction });
};
