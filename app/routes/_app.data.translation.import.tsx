import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import { useState } from 'react';

import { DataComparisonPanel } from '~/components/import/DataComparisonPanel';
import { FileUploadForm } from '~/components/import/FileUploadForm';
import { ImportContextBar } from '~/components/import/ImportContextBar';
import { ImportInstructions } from '~/components/import/ImportInstructions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { getExistingDataPreviewForSection, replaceSectionData } from '~/services/file.server';
import {
  parseCSV,
  parseXLSX,
  type ExcelTranslationRow,
  type ImportOptionsNew,
  type ImportResult,
} from '~/services/file.service';
import { getProjectBySourceDocumentId, getProjectReferences } from '~/services/project.service';
import { getDocument, getSection } from '~/services/text.service';

import { assertAuthUser } from '../auth.server';

// ─── Types ───────────────────────────────────────────────────────────────────

type ActionResponse =
  | { intent: 'preview'; fileRows: ExcelTranslationRow[]; formValues: ImportOptionsNew }
  | { intent: 'replace'; result: ImportResult }
  | { intent: 'error'; result: ImportResult };

// ─── Loader ──────────────────────────────────────────────────────────────────

// Imports write to the refactored tables (documents / sections /
// paragraphs_new) so no more data accumulates in the legacy paragraph tables.

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');

  const url = new URL(request.url);
  const originDocumentId = url.searchParams.get('originDocumentId');
  const targetDocumentId = url.searchParams.get('targetDocumentId');
  const originSectionId = url.searchParams.get('originSectionId');
  const targetSectionId = url.searchParams.get('targetSectionId');

  if (!originDocumentId || !targetDocumentId || !originSectionId) {
    console.error('[import loader] missing required params', {
      originDocumentId,
      targetDocumentId,
      originSectionId,
      targetSectionId,
    });
    return redirect('/data');
  }

  const [originDocument, originSection, targetDocument, targetSection] = await Promise.all([
    getDocument(originDocumentId),
    getSection(originSectionId),
    getDocument(targetDocumentId),
    targetSectionId ? getSection(targetSectionId) : Promise.resolve(null),
  ]);

  if (!originDocument || !originSection || !targetDocument) {
    console.error('[import loader] missing documents or origin section', {
      originDocument: !!originDocument,
      originSection: !!originSection,
      targetDocument: !!targetDocument,
    });
    return redirect('/data');
  }

  // Reference documents — the other columns an import file may carry, and the
  // extra columns shown in the existing-data preview.
  const project = await getProjectBySourceDocumentId(originDocumentId);
  const references = project ? await getProjectReferences(project.id) : [];
  const referenceDocuments = references.map((r) => ({ id: r.documentId, key: r.document?.key ?? null }));
  const referenceKeys = referenceDocuments.map((r) => r.key).filter((k): k is string => !!k);

  const existing = await getExistingDataPreviewForSection(originSectionId, targetDocumentId, referenceDocuments);

  return json({
    originDocumentId,
    targetDocumentId,
    originSectionId,
    originDocumentName: originDocument.title,
    targetDocumentName: targetDocument.title,
    originSectionName: originSection.title ?? '',
    targetSectionName: targetSection?.title ?? '',
    originalLanguage: originDocument.language,
    translationLanguage: targetDocument.language,
    originKey: originDocument.key,
    targetKey: targetDocument.key,
    referenceKeys,
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
    const originDocumentId = formData.get('originDocumentId') as string;
    const originSectionId = formData.get('originSectionId') as string;
    const targetDocumentId = formData.get('targetDocumentId') as string;

    if (!file) {
      return json<ActionResponse>(
        { intent: 'error', result: { success: false, message: 'Please select a file to import.' } },
        { status: 400 },
      );
    }

    // Columns are identified by each document's key. Both keys are optional — the
    // file may carry any subset of documents — so we pass whatever keys exist and
    // let the parser match the columns that are present.
    const [originDocument, targetDocument] = await Promise.all([
      getDocument(originDocumentId),
      getDocument(targetDocumentId),
    ]);
    const keys = { originKey: originDocument?.key ?? null, targetKey: targetDocument?.key ?? null };

    try {
      const fileName = file.name.toLowerCase();
      let rows: ExcelTranslationRow[];

      if (fileName.endsWith('.csv')) {
        rows = await parseCSV(await file.text(), keys);
      } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        rows = await parseXLSX(await file.arrayBuffer(), keys);
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
        formValues: {
          originDocumentId,
          originSectionId,
          targetDocumentId,
          userId: user.id,
        },
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
    const originDocumentId = formData.get('originDocumentId') as string;
    const originSectionId = formData.get('originSectionId') as string;
    const targetDocumentId = formData.get('targetDocumentId') as string;

    if (!rowsJson || !originDocumentId || !originSectionId || !targetDocumentId) {
      return json<ActionResponse>(
        { intent: 'error', result: { success: false, message: 'Missing required data for replace operation.' } },
        { status: 400 },
      );
    }

    const rows: ExcelTranslationRow[] = JSON.parse(rowsJson);
    const result = await replaceSectionData(rows, {
      originDocumentId,
      originSectionId,
      targetDocumentId,
      userId: user.id,
    });

    return json<ActionResponse>({ intent: 'replace', result });
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DataImport() {
  const {
    originDocumentId,
    targetDocumentId,
    originSectionId,
    originDocumentName,
    targetDocumentName,
    originSectionName,
    targetSectionName,
    originalLanguage,
    translationLanguage,
    originKey,
    targetKey,
    referenceKeys,
    existing,
  } = useLoaderData<typeof loader>();
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
          <CardTitle className="text-primary text-2xl">Import Data</CardTitle>
          <CardDescription className="text-base">
            Upload a CSV or XLSX file whose column headers are document keys
            {originKey || targetKey ? (
              <>
                {' '}
                (e.g. <strong>{originKey ?? 'origin'}</strong>, <strong>{targetKey ?? 'translation'}</strong>)
              </>
            ) : null}
            . Include any subset of the documents — the rows are matched to existing data by passage key and/or
            position, and existing rows not in the file are left unchanged.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ImportContextBar
            originRollName={originSectionName}
            targetRollName={targetSectionName}
            originalLanguage={originalLanguage}
            originSutraName={originDocumentName}
            targetSutraName={targetDocumentName}
            translationLanguage={translationLanguage}
          />
          <FileUploadForm
            fileName={fileName}
            errorResult={errorResult}
            isSubmitting={isSubmitting}
            replaceResult={replaceResult}
            originSectionId={originSectionId}
            originDocumentId={originDocumentId}
            navigationIntent={navigationIntent}
            targetDocumentId={targetDocumentId}
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

      <ImportInstructions originKey={originKey} targetKey={targetKey} referenceKeys={referenceKeys} />
    </div>
  );
}
