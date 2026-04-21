import { Form } from '@remix-run/react';
import { AlertCircle, ArrowLeftRight } from 'lucide-react';

import type { ExcelTranslationRow, ExistingDataPreview, ImportOptions } from '~/services/file.service';

import { Alert, AlertDescription } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { PREVIEW_LIMIT } from '~/utils/constants';

import { ParagraphPreviewCard } from './ParagraphPreviewCard';

type Props = {
  existing: ExistingDataPreview;
  fileRows: ExcelTranslationRow[] | null;
  formValues: ImportOptions | null;
  isSubmitting: boolean;
  navigationIntent: string | null;
};

export function DataComparisonPanel({ existing, fileRows, formValues, isSubmitting, navigationIntent }: Props) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl text-primary">
          <ArrowLeftRight className="h-5 w-5" />
          Data Comparison
        </CardTitle>
        <CardDescription className="text-base">
          {fileRows
            ? 'Review the existing data and the imported file data before replacing.'
            : 'Existing data for this roll. Upload a file above to compare.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          {/* Existing data — always shown */}
          <div>
            <h4 className="mb-3 text-base font-medium text-primary">
              Existing Data{' '}
              <span className="text-sm font-normal text-muted-foreground">
                (first {Math.min(PREVIEW_LIMIT, existing.paragraphs.length)} of {existing.totalParagraphs})
              </span>
            </h4>
            {existing.paragraphs.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                No existing data for this roll
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
                  <p className="text-center text-xs text-muted-foreground">
                    ... and {existing.totalParagraphs - PREVIEW_LIMIT} more paragraphs
                  </p>
                )}
              </div>
            )}
          </div>

          {/* File data — placeholder until a file is previewed */}
          <div>
            <h4 className="mb-3 text-base font-medium text-primary">
              File Data{' '}
              {fileRows && (
                <span className="text-sm font-normal text-muted-foreground">
                  (first {Math.min(PREVIEW_LIMIT, fileRows.length)} of {fileRows.length})
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
                  <p className="text-center text-xs text-muted-foreground">
                    ... and {fileRows.length - PREVIEW_LIMIT} more rows
                  </p>
                )}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                Upload and preview a file to see incoming data here
              </p>
            )}
          </div>
        </div>

        {/* Replace action — only shown after a file has been previewed */}
        {fileRows && formValues && (
          <>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Warning:</strong> Clicking "Replace Data" will permanently delete all existing paragraphs and
                references for this roll and replace them with the file data. This action cannot be undone.
              </AlertDescription>
            </Alert>

            <Form method="post">
              <input type="hidden" name="intent" value="replace" />
              <input name="rows" type="hidden" value={JSON.stringify(fileRows)} />
              <input type="hidden" name="originRollId" value={formValues.originRollId} />
              <input type="hidden" name="targetRollId" value={formValues.targetRollId} />
              <input type="hidden" name="originalLanguage" value={formValues.originalLanguage} />
              <input type="hidden" name="translationLanguage" value={formValues.translationLanguage} />

              <div className="flex justify-end gap-3">
                <Button type="submit" variant="destructive" className="text-base" disabled={isSubmitting}>
                  {isSubmitting && navigationIntent === 'replace' ? 'Replacing...' : 'Replace Data'}
                </Button>
              </div>
            </Form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
