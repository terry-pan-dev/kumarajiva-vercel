import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import { useState } from 'react';

import { DataComparisonPanel } from '~/components/import/DataComparisonPanel';
import { FileUploadForm } from '~/components/import/FileUploadForm';
import { ImportContextBar } from '~/components/import/ImportContextBar';
import { ImportInstructions } from '~/components/import/ImportInstructions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { getExistingDataPreviewForRollId, replaceRollData } from '~/services/file.server';
import {
  parseCSV,
  parseXLSX,
  type ExcelTranslationRow,
  type ImportOptions,
  type ImportResult,
} from '~/services/file.service';
import { getRoll } from '~/services/roll.service';
import { getSutra } from '~/services/sutra.service';
import { DEFAULT_ORIGIN_LANG, DEFAULT_TARGET_LANG } from '~/utils/constants';

import { assertAuthUser } from '../auth.server';

// ─── Types ───────────────────────────────────────────────────────────────────

type ActionResponse =
  | { intent: 'preview'; fileRows: ExcelTranslationRow[]; formValues: ImportOptions }
  | { intent: 'replace'; result: ImportResult }
  | { intent: 'error'; result: ImportResult };

// ─── Loader ──────────────────────────────────────────────────────────────────

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

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');

  const formData = await request.formData();
  const intent = formData.get('intent') as string;

  // ── Preview: parse file only ──
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

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DataImport() {
  const { sutraId, rollId, sutraName, rollName, originalLanguage, translationLanguage, existing } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<ActionResponse>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';
  const navigationIntent = (navigation.formData?.get('intent') as string) ?? null;

  const [fileName, setFileName] = useState('');

  const fileRows = actionData?.intent === 'preview' ? actionData.fileRows : null;
  const formValues = actionData?.intent === 'preview' ? actionData.formValues : null;
  const replaceResult = actionData?.intent === 'replace' ? actionData.result : null;
  const errorResult = actionData?.intent === 'error' ? actionData.result : null;

  return (
    <div className="container mx-auto max-w-5xl p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl text-primary">Import Data</CardTitle>
          <CardDescription className="text-base">
            Upload a CSV or XLSX file with columns: <strong>origin</strong>, <strong>translation</strong> (optional).
            This will replace all existing data for the selected roll.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ImportContextBar
            rollName={rollName}
            sutraName={sutraName}
            originalLanguage={originalLanguage}
            translationLanguage={translationLanguage}
          />
          <FileUploadForm
            rollId={rollId}
            sutraId={sutraId}
            fileName={fileName}
            sutraName={sutraName}
            errorResult={errorResult}
            isSubmitting={isSubmitting}
            replaceResult={replaceResult}
            originalLanguage={originalLanguage}
            navigationIntent={navigationIntent}
            translationLanguage={translationLanguage}
            onFileChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
          />
        </CardContent>
      </Card>

      <DataComparisonPanel
        existing={existing}
        fileRows={fileRows}
        formValues={formValues}
        isSubmitting={isSubmitting}
        navigationIntent={navigationIntent}
      />

      <ImportInstructions />
    </div>
  );
}
