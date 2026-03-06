import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { Form, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import { AlertCircle, ArrowLeftRight, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertDescription } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { getExistingDataPreviewForRollId, replaceRollData } from '~/services/file.server';
import {
  parseCSV,
  parseXLSX,
  type ImportOptions,
  type ImportResult,
  type ExcelTranslationRow,
} from '~/services/file.service';
import { getRoll } from '~/services/roll.service';
import { getSutra } from '~/services/sutra.service';
import { DEFAULT_ORIGIN_LANG, DEFAULT_TARGET_LANG, PREVIEW_LIMIT } from '~/utils/constants';

import { assertAuthUser } from '../auth.server';

// ─── Types ──────────────────────────────────────────────────────────────────

type ActionResponse =
  | { intent: 'preview'; fileRows: ExcelTranslationRow[]; formValues: ImportOptions }
  | { intent: 'replace'; result: ImportResult }
  | { intent: 'error'; result: ImportResult };

// ─── Loader ─────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');

  const url = new URL(request.url);
  const sutraId = url.searchParams.get('sutraId');
  const rollId = url.searchParams.get('rollId');

  if (!sutraId || !rollId) return redirect('/data');

  const [sutra, roll, existing] = await Promise.all([
    getSutra(sutraId),
    getRoll(rollId),
    getExistingDataPreviewForRollId(rollId),
  ]);

  if (!sutra || !roll) return redirect('/data');

  return json({
    sutraId,
    rollId,
    sutraName: sutra.title,
    rollName: roll.title,
    originalLanguage: DEFAULT_ORIGIN_LANG,
    translationLanguage: DEFAULT_TARGET_LANG,
    existing,
    userId: user.id,
  });
}

// ─── Action ─────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');

  const formData = await request.formData();
  const intent = formData.get('intent') as string;

  // ── Preview: parse file only — existing data is already in the loader ──
  if (intent === 'preview') {
    const file = formData.get('file') as File;
    const sutraId = formData.get('sutraId') as string;
    const rollId = formData.get('rollId') as string;
    const sutraName = formData.get('sutraName') as string;
    const originalLanguage = formData.get('originalLanguage') as string;
    const translationLanguage = formData.get('translationLanguage') as string;

    if (!file) {
      return json<ActionResponse>(
        { intent: 'error', result: { success: false, message: 'Please select a file to import.' } },
        { status: 400 },
      );
    }

    try {
      const fileName = file.name.toLowerCase();
      let rows: ExcelTranslationRow[];

      if (fileName.endsWith('.csv')) {
        rows = await parseCSV(await file.text());
      } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        rows = await parseXLSX(await file.arrayBuffer());
      } else {
        return json<ActionResponse>(
          {
            intent: 'error',
            result: { success: false, message: 'Invalid file type. Please upload a CSV or XLSX file.' },
          },
          { status: 400 },
        );
      }

      if (rows.length === 0) {
        return json<ActionResponse>(
          {
            intent: 'error',
            result: { success: false, message: 'No valid data found in the file. Please check the file format.' },
          },
          { status: 400 },
        );
      }

      return json<ActionResponse>({
        intent: 'preview',
        fileRows: rows,
        formValues: { sutraId, rollId, sutraName, originalLanguage, translationLanguage, userId: user.id },
      });
    } catch (error) {
      console.error('Preview error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return json<ActionResponse>(
        { intent: 'error', result: { success: false, message: `Failed to parse file: ${errorMessage}` } },
        { status: 500 },
      );
    }
  }

  // ── Replace: insert parsed rows into the database ──
  if (intent === 'replace') {
    const rowsJson = formData.get('rows') as string;
    const sutraId = formData.get('sutraId') as string;
    const rollId = formData.get('rollId') as string;
    const originalLanguage = formData.get('originalLanguage') as string;
    const translationLanguage = formData.get('translationLanguage') as string;

    if (!rowsJson || !sutraId || !rollId || !originalLanguage || !translationLanguage) {
      return json<ActionResponse>(
        { intent: 'error', result: { success: false, message: 'Missing required data for replace operation.' } },
        { status: 400 },
      );
    }

    const rows: ExcelTranslationRow[] = JSON.parse(rowsJson);
    const result = await replaceRollData(rows, {
      sutraId,
      rollId,
      sutraName: '',
      originalLanguage,
      translationLanguage,
      userId: user.id,
    });

    return json<ActionResponse>({ intent: 'replace', result });
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function DataImport() {
  const { sutraId, rollId, sutraName, rollName, originalLanguage, translationLanguage, existing } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<ActionResponse>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';

  const [fileName, setFileName] = useState<string>('');

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setFileName(file ? file.name : '');
  };

  const fileRows = actionData?.intent === 'preview' ? actionData.fileRows : null;
  const formValues = actionData?.intent === 'preview' ? actionData.formValues : null;
  const replaceResult = actionData?.intent === 'replace' ? actionData.result : null;
  const errorResult = actionData?.intent === 'error' ? actionData.result : null;

  return (
    <div className="container mx-auto max-w-5xl p-6">
      {/* ── Import Data Card ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl text-yellow-600">Import Data</CardTitle>
          <CardDescription className="text-base">
            Upload a CSV or XLSX file with columns: <strong>origin</strong>, <strong>translation</strong> (optional).
            This will replace all existing data for the selected roll.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* ── Sutra / Roll / Language context ── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border bg-muted/30 px-4 py-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Sutra</p>
              <p className="text-base font-semibold text-foreground">{sutraName}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 px-4 py-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Roll</p>
              <p className="text-base font-semibold text-foreground">{rollName}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 px-4 py-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Origin Language</p>
              <p className="text-base font-semibold text-foreground">{originalLanguage}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 px-4 py-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Translation Language
              </p>
              <p className="text-base font-semibold text-foreground">{translationLanguage}</p>
            </div>
          </div>

          {/* ── File upload form ── */}
          <Form method="post" className="space-y-4" encType="multipart/form-data">
            <input type="hidden" name="intent" value="preview" />
            <input type="hidden" name="sutraId" value={sutraId} />
            <input type="hidden" name="rollId" value={rollId} />
            <input type="hidden" name="sutraName" value={sutraName} />
            <input type="hidden" name="originalLanguage" value={originalLanguage} />
            <input type="hidden" name="translationLanguage" value={translationLanguage} />

            <div className="space-y-2">
              <Label htmlFor="file" className="text-lg text-yellow-600">
                Data File *
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  required
                  id="file"
                  name="file"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileChange}
                  className="flex-1 text-base"
                />
              </div>
              <div>
                {fileName && (
                  <p>
                    <span className="text-lg text-muted-foreground">Selected: </span>
                    <span className="text-base font-semibold text-foreground">{fileName}</span>
                  </p>
                )}
              </div>
            </div>

            {errorResult && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errorResult.message}</AlertDescription>
              </Alert>
            )}

            {replaceResult && (
              <Alert variant={replaceResult.success ? 'default' : 'destructive'}>
                {replaceResult.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                <AlertDescription>
                  <div className="space-y-2">
                    <p>{replaceResult.message}</p>
                    {replaceResult.errors && replaceResult.errors.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-sm font-medium">
                          View errors ({replaceResult.errors.length})
                        </summary>
                        <ul className="mt-2 space-y-1 text-xs">
                          {replaceResult.errors.map((error, idx) => (
                            <li key={idx}>• {error}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-3">
              <Button asChild type="button" variant="outline" className="text-base text-muted-foreground">
                <a href="/data">Cancel</a>
              </Button>
              <Button type="submit" className="text-base" disabled={isSubmitting}>
                {isSubmitting && navigation.formData?.get('intent') === 'preview'
                  ? 'Reading file...'
                  : 'Preview Import'}
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>

      {/* ── Data Comparison Card — always visible; file side fills in after preview ── */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl text-yellow-600">
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
          {/* Side-by-side paragraph preview */}
          <div className="grid grid-cols-2 gap-4">
            {/* Existing data — always shown */}
            <div>
              <h4 className="mb-3 text-base font-medium text-yellow-600">
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
                    <div key={paragraph.id} className="rounded-lg border p-3">
                      <div className="mb-1">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                          #{paragraph.order}
                        </span>
                      </div>
                      <p className="mb-0.5 text-xs font-medium text-muted-foreground">Original:</p>
                      <p className="text-sm text-foreground">{paragraph.origin}</p>
                      <div className="mt-2 border-t pt-2">
                        <p className="mb-0.5 text-xs font-medium text-muted-foreground">Translation:</p>
                        {paragraph.target ? (
                          <p className="text-sm text-foreground">{paragraph.target}</p>
                        ) : (
                          <p className="text-sm italic text-muted-foreground">No translation</p>
                        )}
                      </div>
                      {!!paragraph.references?.length && (
                        <div className="mt-2 border-t pt-2">
                          {paragraph.references.map((ref) => (
                            <p key={ref.id} className="text-xs text-muted-foreground">
                              <span className="font-medium text-muted-foreground">{ref.sutraName}:</span> {ref.content}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
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
              <h4 className="mb-3 text-base font-medium text-yellow-600">
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
                    <div
                      key={idx}
                      className="rounded-lg border border-green-200 bg-green-50/50 p-3 dark:border-green-900 dark:bg-green-950/20"
                    >
                      <div className="mb-1">
                        <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
                          #{idx + 1}
                        </span>
                      </div>
                      <p className="mb-0.5 text-xs font-medium text-muted-foreground">Original:</p>
                      <p className="text-sm text-foreground">{row.origin}</p>
                      <div className="mt-2 border-t border-green-200 pt-2 dark:border-green-900">
                        <p className="mb-0.5 text-xs font-medium text-muted-foreground">Translation:</p>
                        {row.target ? (
                          <p className="text-sm text-foreground">{row.target}</p>
                        ) : (
                          <p className="text-sm italic text-muted-foreground">No translation</p>
                        )}
                      </div>
                      {!!row.references?.length && (
                        <div className="mt-2 border-t border-green-200 pt-2 dark:border-green-900">
                          {row.references.map((ref, refIdx) => (
                            <p key={refIdx} className="text-xs text-muted-foreground">
                              <span className="font-medium text-muted-foreground">{ref.sutraName}:</span> {ref.content}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
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
                <input type="hidden" name="sutraId" value={formValues.sutraId} />
                <input type="hidden" name="rollId" value={formValues.rollId} />
                <input type="hidden" name="originalLanguage" value={formValues.originalLanguage} />
                <input type="hidden" name="translationLanguage" value={formValues.translationLanguage} />

                <div className="flex justify-end gap-3">
                  <Button type="submit" variant="destructive" className="text-base" disabled={isSubmitting}>
                    {isSubmitting && navigation.formData?.get('intent') === 'replace' ? 'Replacing...' : 'Replace Data'}
                  </Button>
                </div>
              </Form>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Instructions Card ── */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-xl text-yellow-600">File Format Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-base">
          <div>
            <h4 className="mb-1 text-base font-medium text-yellow-600">CSV Format:</h4>
            <pre className="overflow-x-auto rounded bg-muted p-3 text-sm text-muted-foreground">
              {`origin,translation\n諸法因緣生,All dharmas arise from causes and conditions\n諸法因緣滅,All dharmas cease through causes and conditions`}
            </pre>
          </div>
          <div>
            <h4 className="mb-1 text-base font-medium text-yellow-600">Excel Format:</h4>
            <p className="text-base text-muted-foreground">
              Create an Excel file with the same column structure. The first row should contain headers: "origin" and
              "translation".
            </p>
          </div>
          <div>
            <h4 className="mb-1 text-base font-medium text-yellow-600">Notes:</h4>
            <ul className="list-inside list-disc space-y-1 text-base text-muted-foreground">
              <li>The "origin" column is required (also accepts "original" for backwards compatibility)</li>
              <li>The "translation" column is optional (also accepts "target")</li>
              <li>All other columns will be ignored</li>
              <li>Column names are case-insensitive</li>
              <li>Empty rows will be skipped</li>
              <li>
                Importing will <strong>replace</strong> all existing data for the selected roll
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
