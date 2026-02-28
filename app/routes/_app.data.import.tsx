import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { Form, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import { AlertCircle, ArrowLeftRight, CheckCircle2, Upload } from 'lucide-react';
import { useState, useEffect } from 'react';

import { Alert, AlertDescription } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import {
  parseCSV,
  parseXLSX,
  getExistingDataPreviewForRollId,
  PREVIEW_LIMIT,
  type ImportOptions,
  type ImportResult,
  type ExcelTranslationRow,
  type ExistingDataPreview,
} from '~/services/file.service';
import { readSutrasAndRolls, getSutra } from '~/services/sutra.service';
import { DEFAULT_ORIGIN_LANG, DEFAULT_TARGET_LANG, SUPPORTED_LANGUAGES } from '~/utils/constants';

import { assertAuthUser } from '../auth.server';

// ─── Types ──────────────────────────────────────────────────────────────────

interface PreviewData {
  fileRows: ExcelTranslationRow[];
  existing: ExistingDataPreview;
}

type ActionResponse =
  | { intent: 'preview'; preview: PreviewData; formValues: ImportOptions }
  | { intent: 'replace'; result: ImportResult }
  | { intent: 'error'; result: ImportResult };

// ─── Loader ─────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }

  const url = new URL(request.url);
  const sutraId = url.searchParams.get('sutraId');
  const rollId = url.searchParams.get('rollId');

  try {
    const sutrasWithRolls = await readSutrasAndRolls({ user });
    return json({ sutrasWithRolls, preselectedSutraId: sutraId, preselectedRollId: rollId });
  } catch (error) {
    console.error(error);
    throw new Error('Internal Server Error');
  }
}

// ─── Action ─────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }

  const formData = await request.formData();
  const intent = formData.get('intent') as string;

  // ── Preview: parse file and fetch existing data ──
  if (intent === 'preview') {
    const file = formData.get('file') as File;
    const sutraId = formData.get('sutraId') as string;
    const rollId = formData.get('rollId') as string;
    const originalLanguage = formData.get('originalLanguage') as string;
    const translationLanguage = formData.get('translationLanguage') as string;

    if (!file || !sutraId || !rollId || !originalLanguage || !translationLanguage) {
      return json<ActionResponse>(
        {
          intent: 'error',
          result: { success: false, message: 'Please fill in all required fields and select a file' },
        },
        { status: 400 },
      );
    }

    try {
      const fileName = file.name.toLowerCase();
      let rows: ExcelTranslationRow[];

      if (fileName.endsWith('.csv')) {
        const text = await file.text();
        rows = await parseCSV(text);
      } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        const buffer = await file.arrayBuffer();
        rows = await parseXLSX(buffer);
      } else {
        return json<ActionResponse>(
          {
            intent: 'error',
            result: { success: false, message: 'Invalid file type. Please upload a CSV or XLSX file' },
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

      // Find sutra name for display
      const sutra = await getSutra(sutraId);
      const sutraName = sutra?.title || sutraId;
      const userId = user.id;

      const existing = await getExistingDataPreviewForRollId(rollId);

      return json<ActionResponse>({
        intent: 'preview',
        preview: { fileRows: rows, existing },
        formValues: { sutraId, rollId, sutraName, originalLanguage, translationLanguage, userId },
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

  // ── Replace: atomically replace data ──
  if (intent === 'replace') {
    const rowsJson = formData.get('rows') as string;
    const sutraId = formData.get('sutraId') as string;
    const rollId = formData.get('rollId') as string;
    const originalLanguage = formData.get('originalLanguage') as string;
    const translationLanguage = formData.get('translationLanguage') as string;

    if (!rowsJson || !sutraId || !rollId || !originalLanguage || !translationLanguage) {
      return json<ActionResponse>(
        { intent: 'error', result: { success: false, message: 'Missing required data for replace operation' } },
        { status: 400 },
      );
    }
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function DataImport() {
  const { sutrasWithRolls, preselectedSutraId = '', preselectedRollId = '' } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionResponse>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';

  const [selectedSutraId, setSelectedSutraId] = useState<string>(preselectedSutraId || '');
  const [fileName, setFileName] = useState<string>('');

  useEffect(() => {
    if (preselectedSutraId) {
      setSelectedSutraId(preselectedSutraId);
    }
  }, [preselectedSutraId]);

  const selectedSutra = sutrasWithRolls.find((s) => s.id === selectedSutraId);
  const rolls = selectedSutra?.rolls || [];

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setFileName(file ? file.name : '');
  };

  // Derived state from action data
  const previewData = actionData?.intent === 'preview' ? actionData.preview : null;
  const formValues = actionData?.intent === 'preview' ? actionData.formValues : null;
  const replaceResult = actionData?.intent === 'replace' ? actionData.result : null;
  const errorResult = actionData?.intent === 'error' ? actionData.result : null;

  return (
    <div className="container mx-auto max-w-5xl p-6">
      {/* ── Step 1: Upload Form ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl text-yellow-600">Import Data</CardTitle>
          <CardDescription className="text-base">
            Upload a CSV or XLSX file with columns: <strong>origin</strong>, <strong>translation</strong> (optional).
            This will replace all existing data for the selected roll.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="post" className="space-y-6" encType="multipart/form-data">
            <input type="hidden" name="intent" value="preview" />

            {/* File Upload */}
            <div className="space-y-2">
              <Label htmlFor="file" className="text-lg text-yellow-600">
                Data File *
              </Label>
              <div className="flex items-center gap-4">
                <Input
                  required
                  id="file"
                  name="file"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileChange}
                  className="flex-1 text-base"
                />
                <Upload className="h-5 w-5 text-muted-foreground" />
              </div>
              {fileName && <p className="text-sm text-muted-foreground">Selected: {fileName}</p>}
            </div>

            {/* Sutra Selection */}
            <div className="space-y-2">
              <Label htmlFor="sutraId" className="text-lg text-yellow-600">
                Sutra *
              </Label>
              <Select
                required
                name="sutraId"
                onValueChange={setSelectedSutraId}
                defaultValue={preselectedSutraId || undefined}
              >
                <SelectTrigger className="text-base text-foreground">
                  <SelectValue placeholder="Select a sutra" />
                </SelectTrigger>
                <SelectContent>
                  {sutrasWithRolls.map((sutra) => (
                    <SelectItem key={sutra.id} value={sutra.id} className="text-base">
                      {sutra.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Roll Selection */}
            <div className="space-y-2">
              <Label htmlFor="rollId" className="text-lg text-yellow-600">
                Roll *
              </Label>
              <Select
                required
                name="rollId"
                key={selectedSutraId}
                defaultValue={preselectedRollId || undefined}
                disabled={!selectedSutraId || rolls.length === 0}
              >
                <SelectTrigger className="text-base text-foreground">
                  <SelectValue placeholder={rolls.length === 0 ? 'Select a sutra first' : 'Select a roll'} />
                </SelectTrigger>
                <SelectContent>
                  {rolls.map((roll) => (
                    <SelectItem key={roll.id} value={roll.id} className="text-base">
                      {roll.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Languages */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="originalLanguage" className="text-lg text-yellow-600">
                  Original Language *
                </Label>
                <Select required name="originalLanguage" defaultValue={DEFAULT_ORIGIN_LANG}>
                  <SelectTrigger className="text-base text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <SelectItem key={lang.value} value={lang.value} className="text-base">
                        {lang.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="translationLanguage" className="text-lg text-yellow-600">
                  Translation Language *
                </Label>
                <Select required name="translationLanguage" defaultValue={DEFAULT_TARGET_LANG}>
                  <SelectTrigger className="text-base text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <SelectItem key={lang.value} value={lang.value} className="text-base">
                        {lang.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Error from preview/replace */}
            {errorResult && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errorResult.message}</AlertDescription>
              </Alert>
            )}

            {/* Replace result */}
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

            {/* Submit Button */}
            <div className="flex justify-end gap-3">
              <Button asChild type="button" variant="outline" className="text-base text-muted-foreground">
                <a href="/dashboard">Cancel</a>
              </Button>
              <Button type="submit" className="text-base" disabled={isSubmitting}>
                {isSubmitting && navigation.formData?.get('intent') === 'preview' ? 'Reading file...' : 'Import'}
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>

      {/* ── Step 2: Preview & Comparison ── */}
      {previewData && formValues && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl text-yellow-600">
              <ArrowLeftRight className="h-5 w-5" />
              Data Comparison
            </CardTitle>
            <CardDescription className="text-base">
              Review the existing data and the imported file data before replacing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border bg-muted/50 p-4">
                <h4 className="mb-1 font-medium text-muted-foreground">Existing Data (Database)</h4>
                <p className="font-semibold text-muted-foreground">{previewData.existing.totalParagraphs} paragraphs</p>
                <p className="text-sm text-muted-foreground">{previewData.existing.totalReferences} references</p>
              </div>
              <div className="rounded-lg border bg-muted/50 p-4">
                <h4 className="mb-1 font-medium text-muted-foreground">File Data (Import)</h4>
                <p className="font-semibold text-muted-foreground">{previewData.fileRows.length} rows</p>
                <p className="text-sm text-muted-foreground">
                  {previewData.fileRows.filter((r) => r.target).length} with translations
                </p>
              </div>
            </div>

            {/* Side-by-side comparison */}
            <div className="grid grid-cols-2 gap-4">
              {/* Existing data */}
              <div>
                <h4 className="mb-3 text-base font-medium text-yellow-600">
                  Existing Data{' '}
                  <span className="text-sm font-normal text-muted-foreground">
                    (first {Math.min(PREVIEW_LIMIT, previewData.existing.totalParagraphs)} of{' '}
                    {previewData.existing.totalParagraphs})
                  </span>
                </h4>
                {previewData.existing.paragraphs.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                    No existing data for this roll
                  </p>
                ) : (
                  <div className="space-y-2">
                    {previewData.existing.paragraphs.map((paragraph) => (
                      <div key={paragraph.id} className="rounded-lg border p-3">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                            #{paragraph.order}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{paragraph.origin}</p>
                        {paragraph.target && (
                          <div className="mt-2 border-t pt-2">
                            <p className="text-xs text-muted-foreground">
                              <span className="font-medium text-muted-foreground">Translation:</span> {paragraph.target}
                            </p>
                          </div>
                        )}
                        {!!paragraph.references?.length && (
                          <div className="mt-2 border-t pt-2">
                            {paragraph.references.map((ref) => (
                              <p key={ref.id} className="text-xs text-muted-foreground">
                                <span className="font-medium text-muted-foreground">Ref:</span> {ref.content}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {previewData.existing.totalParagraphs > PREVIEW_LIMIT && (
                      <p className="text-center text-xs text-muted-foreground">
                        ... and {previewData.existing.totalParagraphs - PREVIEW_LIMIT} more paragraphs
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* File data */}
              <div>
                <h4 className="mb-3 text-base font-medium text-yellow-600">
                  File Data{' '}
                  <span className="text-sm font-normal text-muted-foreground">
                    (first {Math.min(PREVIEW_LIMIT, previewData.fileRows.length)} of {previewData.fileRows.length})
                  </span>
                </h4>
                <div className="space-y-2">
                  {previewData.fileRows.slice(0, PREVIEW_LIMIT).map((row, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-green-200 bg-green-50/50 p-3 dark:border-green-900 dark:bg-green-950/20"
                    >
                      <div className="mb-1">
                        <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
                          #{idx + 1}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{row.origin}</p>
                      {row.target && (
                        <div className="mt-2 border-t border-green-200 pt-2 dark:border-green-900">
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium text-muted-foreground">Translation:</span> {row.target}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                  {previewData.fileRows.length > PREVIEW_LIMIT && (
                    <p className="text-center text-xs text-muted-foreground">
                      ... and {previewData.fileRows.length - PREVIEW_LIMIT} more rows
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Replace action */}
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Warning:</strong> Clicking "Replace Data" will permanently delete all existing paragraphs and
                references for this roll and replace them with the file data. This action cannot be undone.
              </AlertDescription>
            </Alert>

            <Form method="post">
              <input type="hidden" name="intent" value="replace" />
              <input name="rows" type="hidden" value={JSON.stringify(previewData.fileRows)} />
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
          </CardContent>
        </Card>
      )}

      {/* ── Instructions Card ── */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-xl text-yellow-600">File Format Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-base">
          <div>
            <h4 className="mb-1 text-base font-medium text-yellow-600">CSV Format:</h4>
            <pre className="overflow-x-auto rounded bg-muted p-3 text-sm text-muted-foreground">
              {`origin,translation
諸法因緣生,All dharmas arise from causes and conditions
諸法因緣滅,All dharmas cease through causes and conditions`}
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
