import { Form } from '@remix-run/react';
import { AlertCircle, ArrowLeftRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { ExcelTranslationRow, ExistingDataPreview, ImportOptionsNew } from '~/services/file.service';

import { Alert, AlertDescription } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { PREVIEW_LIMIT } from '~/utils/constants';

import { ParagraphPreviewCard } from './ParagraphPreviewCard';

type Props = {
  existing: ExistingDataPreview;
  fileRows: ExcelTranslationRow[] | null;
  formValues: ImportOptionsNew | null;
  isSubmitting: boolean;
  navigationIntent: string | null;
};

export function DataComparisonPanel({ existing, fileRows, formValues, isSubmitting, navigationIntent }: Props) {
  const { t } = useTranslation('data');
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-primary flex items-center gap-2 text-xl">
          <ArrowLeftRight className="h-5 w-5" />
          {t('projects.import.comparison.title')}
        </CardTitle>
        <CardDescription className="text-base">
          {t(fileRows ? 'projects.import.comparison.descriptionWithFile' : 'projects.import.comparison.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          {/* Existing data — always shown */}
          <div>
            <h4 className="text-primary mb-3 text-base font-medium">
              {t('projects.import.comparison.existing')}{' '}
              <span className="text-muted-foreground text-sm font-normal">
                {t('projects.import.comparison.firstOf', {
                  shown: Math.min(PREVIEW_LIMIT, existing.paragraphs.length),
                  total: existing.totalParagraphs,
                })}
              </span>
            </h4>
            {existing.paragraphs.length === 0 ? (
              <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
                {t('projects.import.comparison.noExisting')}
              </p>
            ) : (
              <div className="space-y-2">
                {existing.paragraphs.map((paragraph) => (
                  <ParagraphPreviewCard
                    key={paragraph.id}
                    variant="existing"
                    origin={paragraph.origin}
                    target={paragraph.target}
                    references={paragraph.references}
                    order={paragraph.order ?? paragraph.id}
                  />
                ))}
                {existing.totalParagraphs > PREVIEW_LIMIT && (
                  <p className="text-muted-foreground text-center text-xs">
                    {t('projects.import.comparison.moreParagraphs', {
                      count: existing.totalParagraphs - PREVIEW_LIMIT,
                    })}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* File data — placeholder until a file is previewed */}
          <div>
            <h4 className="text-primary mb-3 text-base font-medium">
              {t('projects.import.comparison.file')}{' '}
              {fileRows && (
                <span className="text-muted-foreground text-sm font-normal">
                  {t('projects.import.comparison.firstOf', {
                    shown: Math.min(PREVIEW_LIMIT, fileRows.length),
                    total: fileRows.length,
                  })}
                </span>
              )}
            </h4>
            {fileRows ? (
              <div className="space-y-2">
                {fileRows.slice(0, PREVIEW_LIMIT).map((row, idx) => (
                  <ParagraphPreviewCard
                    key={idx}
                    order={idx + 1}
                    variant="incoming"
                    origin={row.origin}
                    target={row.target}
                    references={row.references}
                  />
                ))}
                {fileRows.length > PREVIEW_LIMIT && (
                  <p className="text-muted-foreground text-center text-xs">
                    {t('projects.import.comparison.moreRows', { count: fileRows.length - PREVIEW_LIMIT })}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
                {t('projects.import.comparison.filePlaceholder')}
              </p>
            )}
          </div>
        </div>

        {/* Import action — only shown after a file has been previewed */}
        {fileRows && formValues && (
          <>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{t('projects.import.comparison.importNote')}</AlertDescription>
            </Alert>

            <Form method="post">
              <input type="hidden" name="intent" value="replace" />
              <input name="rows" type="hidden" value={JSON.stringify(fileRows)} />
              <input type="hidden" name="originDocumentId" value={formValues.originDocumentId} />
              <input type="hidden" name="originSectionId" value={formValues.originSectionId} />
              <input type="hidden" name="targetDocumentId" value={formValues.targetDocumentId} />

              <div className="flex justify-end gap-3">
                <Button type="submit" className="text-base" disabled={isSubmitting}>
                  {t(
                    isSubmitting && navigationIntent === 'replace'
                      ? 'projects.import.comparison.importing'
                      : 'projects.import.comparison.import',
                  )}
                </Button>
              </div>
            </Form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
