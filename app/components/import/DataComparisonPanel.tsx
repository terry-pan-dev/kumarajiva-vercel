import { Form } from '@remix-run/react';
import { AlertCircle, ArrowLeftRight } from 'lucide-react';

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
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-primary flex items-center gap-2 text-xl">
          <ArrowLeftRight className="h-5 w-5" />
          Data Comparison
        </CardTitle>
        <CardDescription className="text-base">
          {fileRows
            ? 'Review the existing data and the imported file data before replacing.'
            : 'Existing data for this section. Upload a file above to compare.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          {/* Existing data — always shown */}
          <div>
            <h4 className="text-primary mb-3 text-base font-medium">
              Existing Data{' '}
              <span className="text-muted-foreground text-sm font-normal">
                (first {Math.min(PREVIEW_LIMIT, existing.paragraphs.length)} of {existing.totalParagraphs})
              </span>
            </h4>
            {existing.paragraphs.length === 0 ? (
              <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
                No existing data for this section
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
                    ... and {existing.totalParagraphs - PREVIEW_LIMIT} more paragraphs
                  </p>
                )}
              </div>
            )}
          </div>

          {/* File data — placeholder until a file is previewed */}
          <div>
            <h4 className="text-primary mb-3 text-base font-medium">
              File Data{' '}
              {fileRows && (
                <span className="text-muted-foreground text-sm font-normal">
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
                  <p className="text-muted-foreground text-center text-xs">
                    ... and {fileRows.length - PREVIEW_LIMIT} more rows
                  </p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
                Upload and preview a file to see incoming data here
              </p>
            )}
          </div>
        </div>

        {/* Import action — only shown after a file has been previewed */}
        {fileRows && formValues && (
          <>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Clicking "Import Data" adds or updates the rows in the file, matched by passage key and/or position.
                Existing paragraphs not present in the file are left unchanged — nothing is deleted.
              </AlertDescription>
            </Alert>

            <Form method="post">
              <input type="hidden" name="intent" value="replace" />
              <input name="rows" type="hidden" value={JSON.stringify(fileRows)} />
              <input type="hidden" name="originDocumentId" value={formValues.originDocumentId} />
              <input type="hidden" name="originSectionId" value={formValues.originSectionId} />
              <input type="hidden" name="targetDocumentId" value={formValues.targetDocumentId} />

              <div className="flex justify-end gap-3">
                <Button type="submit" className="text-base" disabled={isSubmitting}>
                  {isSubmitting && navigationIntent === 'replace' ? 'Importing...' : 'Import Data'}
                </Button>
              </div>
            </Form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
