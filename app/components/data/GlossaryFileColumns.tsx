import { Trans, useTranslation } from 'react-i18next';

// The glossary file columns, as documented on the import and replace pages. The two
// pages describe UUID and EnglishTerm differently, since replace doesn't match rows.
const COLUMNS = {
  import: [
    ['UUID', 'uuidImport'],
    ['ChineseTerm', 'chineseTerm'],
    ['EnglishTerm', 'englishTermImport'],
  ],
  replace: [
    ['UUID', 'uuidReplace'],
    ['ChineseTerm', 'chineseTerm'],
    ['EnglishTerm', 'englishTermReplace'],
  ],
  shared: [
    ['Phonetic', 'phonetic'],
    ['Author', 'author'],
    ['CBetaFrequency', 'cbetaFrequency'],
    ['SutraName', 'sutraName'],
    ['Volume', 'volume'],
    ['ChineseSutraText', 'chineseSutraText'],
    ['EnglishSutraText', 'englishSutraText'],
  ],
} as const;

export function GlossaryFileColumns({ variant }: { variant: 'import' | 'replace' }) {
  const { t } = useTranslation('glossary');
  return (
    <>
      <p className="text-foreground mb-1 font-medium">{t('chunked.columnsHeading')}</p>
      <ul className="ml-4 list-disc space-y-0.5">
        {[...COLUMNS[variant], ...COLUMNS.shared].map(([column, key]) => (
          <li key={column}>
            <code>{column}</code> —{' '}
            <Trans t={t} i18nKey={`chunked.columns.${key}`} components={{ strong: <strong /> }} />
          </li>
        ))}
      </ul>
    </>
  );
}
