import { AbilityBuilder, PureAbility } from '@casl/ability';

import { type ReadUser } from '~/drizzle/schema';

type Actions = 'Create' | 'Read' | 'Update' | 'Delete' | 'Download';
type Subjects =
  | 'Administration'
  | 'Sutra'
  | 'OriginText'
  | 'Paragraph'
  | 'DataManagement'
  | 'Translation'
  | 'Glossary'
  | 'Comment'
  | 'History';

// Only the role is consulted, so callers may pass anything role-shaped — a full ReadUser,
// or a bare { role } recovered from a loader.
export const defineAbilityFor = (user: Pick<ReadUser, 'role'>) => {
  const { can, build } = new AbilityBuilder(PureAbility<[Actions, Subjects]>);
  if (user.role === 'admin') {
    can('Read', 'Administration');
    can('Create', 'Sutra');
  }
  if (user.role === 'editor' || user.role === 'admin' || user.role === 'leader') {
    can('Read', 'Paragraph');
    can('Create', 'Paragraph');
    can('Update', 'Paragraph');
    can('Delete', 'Paragraph');
    can('Download', 'Paragraph');
  }

  if (user.role === 'admin' || user.role === 'leader' || user.role === 'manager') {
    can('Update', 'OriginText');
  }

  if (user.role === 'admin' || user.role === 'manager') {
    can('Read', 'DataManagement');
    can('Read', 'Paragraph');
    can('Create', 'Paragraph');
    can('Update', 'Paragraph');
  }

  if (user.role === 'admin' || user.role === 'leader' || user.role === 'editor') {
    can('Create', 'Comment');
    can('Read', 'History');
  }

  if (user.role === 'admin' || user.role === 'editor' || user.role === 'manager' || user.role === 'leader') {
    can('Read', 'Translation');
  }
  // ── Glossary ──
  // Manager holds Read DataManagement, so it also needs write access for the /data/glossary
  // tools to be usable rather than merely visible.
  if (user.role === 'admin' || user.role === 'editor' || user.role === 'leader' || user.role === 'manager') {
    can('Update', 'Glossary');
  }
  // Gates bulk import (/data/glossary/import), which creates entries as well as updating them.
  // Exporting the whole glossary as CSV — /glossary/download and /data/glossary/download.
  if (user.role === 'admin' || user.role === 'manager') {
    can('Create', 'Glossary');
    can('Download', 'Glossary');
  }
  if (user.role === 'admin') {
    // Wholesale replacement of the glossary — see /data/glossary/replace.
    can('Delete', 'Glossary');
  }
  return build();
};
