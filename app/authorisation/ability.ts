import { AbilityBuilder, PureAbility } from '@casl/ability';

import { type ReadUser } from '~/drizzle/schema';

type Actions = 'Create' | 'Read' | 'Update' | 'Delete' | 'Download';
type Subjects =
  | 'Administration'
  | 'Sutra'
  | 'Paragraph'
  | 'Reference'
  | 'Translation'
  | 'Glossary'
  | 'Comment'
  | 'History';

export const defineAbilityFor = (user: ReadUser) => {
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

  if (user.role === 'admin' || user.role === 'manager') {
    can('Read', 'Reference');
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
  if (user.role === 'admin' || user.role === 'editor' || user.role === 'leader') {
    can('Update', 'Glossary');
  }
  if (user.role === 'admin') {
    can('Create', 'Glossary');
    can('Download', 'Glossary');
  }
  return build();
};
