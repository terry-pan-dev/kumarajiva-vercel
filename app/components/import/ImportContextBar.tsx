import { useTranslation } from 'react-i18next';

import type { Lang } from '~/utils/constants';

type Props = {
  originSutraName: string;
  targetSutraName: string;
  originRollName: string;
  targetRollName: string;
  originalLanguage: string;
  translationLanguage: string;
};

function ContextTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/30 rounded-lg border px-4 py-3">
      <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">{label}</p>
      <p className="text-foreground text-base font-semibold">{value}</p>
    </div>
  );
}

export function ImportContextBar({
  originSutraName,
  targetSutraName,
  originRollName,
  targetRollName,
  originalLanguage,
  translationLanguage,
}: Props) {
  const { t } = useTranslation(['data', 'common']);
  const language = (lang: string) => t(`common:languages.${lang as Lang}`);
  return (
    <div className="grid grid-cols-3 gap-3">
      <ContextTile value={originSutraName} label={t('projects.import.context.originDocument')} />
      <ContextTile value={originRollName} label={t('projects.import.context.originSection')} />
      <ContextTile value={language(originalLanguage)} label={t('projects.import.context.originLanguage')} />
      <ContextTile value={targetSutraName} label={t('projects.import.context.targetDocument')} />
      <ContextTile value={targetRollName} label={t('projects.import.context.targetSection')} />
      <ContextTile value={language(translationLanguage)} label={t('projects.import.context.targetLanguage')} />
    </div>
  );
}
