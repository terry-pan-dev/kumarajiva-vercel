import { Trans, useTranslation } from 'react-i18next';

import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';

type Props = {
  originKey: string | null;
  targetKey: string | null;
  referenceKeys: string[];
};

// Inline markup the translated instructions may use: <strong> and <code>.
const richText = {
  strong: <strong />,
  code: <code className="bg-muted rounded px-1 font-mono" />,
};

export function ImportInstructions({ originKey, targetKey, referenceKeys }: Props) {
  const { t } = useTranslation('data');
  // Fall back to generic placeholders when a document has no key set yet.
  const origin = originKey ?? t('projects.import.originPlaceholder');
  const target = targetKey ?? t('projects.import.translationPlaceholder');
  const firstRef = referenceKeys[0];

  // Example headers: the two main documents, the first reference (if any), then
  // the reserved passage_key column.
  const exampleColumns = [origin, target, ...(firstRef ? [firstRef] : []), 'passage_key'];
  const csvExample = [
    exampleColumns.join(','),
    [`諸法因緣生`, `All dharmas arise from causes and conditions`, ...(firstRef ? ['…'] : []), 'T30n1579.1.1'].join(
      ',',
    ),
    [`諸法因緣滅`, `All dharmas cease through causes and conditions`, ...(firstRef ? ['…'] : []), 'T30n1579.1.2'].join(
      ',',
    ),
  ].join('\n');

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-primary text-xl">{t('projects.import.instructions.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-base">
        <div>
          <h4 className="text-primary mb-1 text-base font-medium">
            {t('projects.import.instructions.columnsHeading')}
          </h4>
          <p className="text-muted-foreground text-base">
            <Trans t={t} components={richText} i18nKey="projects.import.instructions.columnsBody" />
          </p>
        </div>

        <div>
          <h4 className="text-primary mb-1 text-base font-medium">{t('projects.import.instructions.keysHeading')}</h4>
          <ul className="text-muted-foreground list-inside list-disc space-y-1 text-base">
            <li>
              {t('projects.import.instructions.origin')}{' '}
              <code className="bg-muted rounded px-1 font-mono">{origin}</code>
              {!originKey && t('projects.import.instructions.noKeyYet')}
            </li>
            <li>
              {t('projects.import.instructions.translation')}{' '}
              <code className="bg-muted rounded px-1 font-mono">{target}</code>
              {!targetKey && t('projects.import.instructions.noKeyYet')}
            </li>
            {referenceKeys.length > 0 && (
              <li>
                {t('projects.import.instructions.references')}{' '}
                {referenceKeys.map((k, i) => (
                  <span key={k}>
                    {i > 0 && ', '}
                    <code className="bg-muted rounded px-1 font-mono">{k}</code>
                  </span>
                ))}
              </li>
            )}
            <li>
              <Trans t={t} components={richText} i18nKey="projects.import.instructions.passageKey" />
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-primary mb-1 text-base font-medium">{t('projects.import.instructions.csvHeading')}</h4>
          <pre className="bg-muted text-muted-foreground overflow-x-auto rounded p-3 text-sm">{csvExample}</pre>
          <p className="text-muted-foreground mt-1 text-base">{t('projects.import.instructions.xlsxNote')}</p>
        </div>

        <div>
          <h4 className="text-primary mb-1 text-base font-medium">
            {t('projects.import.instructions.matchingHeading')}
          </h4>
          <ul className="text-muted-foreground list-inside list-disc space-y-1 text-base">
            <li>
              <Trans t={t} components={richText} i18nKey="projects.import.instructions.matchingSubset" />
            </li>
            <li>
              <Trans t={t} components={richText} i18nKey="projects.import.instructions.matchingAlign" />
            </li>
            <li>
              <Trans t={t} components={richText} i18nKey="projects.import.instructions.matchingUpsert" />
            </li>
            <li>{t('projects.import.instructions.matchingEmptyCells')}</li>
            <li>{t('projects.import.instructions.matchingEmptyRows')}</li>
          </ul>
        </div>

        <div>
          <h4 className="text-primary mb-1 text-base font-medium">{t('projects.import.instructions.setupHeading')}</h4>
          <ul className="text-muted-foreground list-inside list-disc space-y-1 text-base">
            <li>{t('projects.import.instructions.setupSection')}</li>
            <li>{t('projects.import.instructions.setupSkipped')}</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
