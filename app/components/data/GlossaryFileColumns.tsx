import { Trans, useTranslation } from 'react-i18next';

// The glossary file columns, as documented on the import and replace pages, in the order an
// export writes them. The two pages describe TranslationUUID, EnglishTerm and SourceTermUUID
// differently, since replace doesn't match rows.
const COLUMNS = {
  import: {
    first: [
      ['TranslationUUID', 'translationUuidImport'],
      ['ChineseTerm', 'chineseTerm'],
      ['EnglishTerm', 'englishTermImport'],
    ],
    last: [['SourceTermUUID', 'sourceTermUuidImport']],
  },
  replace: {
    first: [
      ['TranslationUUID', 'translationUuidReplace'],
      ['ChineseTerm', 'chineseTerm'],
      ['EnglishTerm', 'englishTermReplace'],
    ],
    last: [['SourceTermUUID', 'sourceTermUuidReplace']],
  },
} as const;

const SHARED_COLUMNS = [
  ['ChineseSutraText', 'chineseSutraText'],
  ['EnglishSutraText', 'englishSutraText'],
  ['SutraName', 'sutraName'],
  ['Volume', 'volume'],
  ['CBetaFrequency', 'cbetaFrequency'],
  ['Author', 'author'],
  ['Phonetic', 'phonetic'],
  ['Discussion', 'discussion'],
] as const;

export function GlossaryFileColumns({ variant }: { variant: 'import' | 'replace' }) {
  const { t } = useTranslation('glossary');
  const { first, last } = COLUMNS[variant];
  return (
    <>
      <p className="text-foreground mb-1 font-medium">{t('chunked.columnsHeading')}</p>
      <ul className="ml-4 list-disc space-y-0.5">
        {[...first, ...SHARED_COLUMNS, ...last].map(([column, key]) => (
          <li key={column}>
            <code>{column}</code> —{' '}
            <Trans t={t} i18nKey={`chunked.columns.${key}`} components={{ strong: <strong /> }} />
          </li>
        ))}
      </ul>
    </>
  );
}
