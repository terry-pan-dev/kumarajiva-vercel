import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import { AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { DataComparisonPanel } from '~/components/import/DataComparisonPanel';
import { FileUploadForm } from '~/components/import/FileUploadForm';
import { ImportContextBar } from '~/components/import/ImportContextBar';
import { ImportInstructions } from '~/components/import/ImportInstructions';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { localizeError } from '~/i18n/errors';
import { getFixedT } from '~/i18n/locale.server';
import {
  getExistingDataPreviewForSection,
  replaceSectionData,
  resolveImportContext,
  type ImportContext,
} from '~/services/file.server';
import { parseCSV, parseXLSX, type ExcelTranslationRow, type ImportResult } from '~/services/file.service';

import { assertAuthUser } from '../auth.server';
import { defineAbilityFor } from '../authorisation';

// ─── Types ───────────────────────────────────────────────────────────────────

type ActionResponse =
  | { intent: 'preview'; fileRows: ExcelTranslationRow[] }
  | { intent: 'replace'; result: ImportResult }
  | { intent: 'error'; result: ImportResult };

// ─── Loader ──────────────────────────────────────────────────────────────────

// Imports write to the refactored tables (documents / sections /
// paragraphs_new) so no more data accumulates in the legacy paragraph tables.
//
// The URL names the project and the origin section; everything else — the
// project's documents and each one's counterpart section — is resolved on the
// server in one query (resolveImportContext). The loader and both action
// intents resolve it afresh, so nothing about where data goes comes from the
// client.

// A reference document as the existing-data preview expects it.
const previewReferences = (context: ImportContext) =>
  context.references.map((r) => ({
    documentId: r.document.id,
    document: { key: r.document.key, title: r.document.title },
  }));

// Column keys the parser should recognise.
const columnKeys = (context: ImportContext) => ({
  originKey: context.origin.document.key,
  targetKey: context.target.document.key,
  referenceKeys: context.references.map((r) => r.document.key).filter((k): k is string => !!k),
});

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');
  if (defineAbilityFor(user).cannot('Maintain', 'TranslationData')) {
    throw redirect('/data');
  }

  const { projectId, sectionId } = params;
  const context = projectId && sectionId ? await resolveImportContext(projectId, sectionId) : null;
  if (!context) {
    console.error('[import loader] project or section not found', { projectId, sectionId });
    return redirect('/data');
  }

  const { origin, target } = context;
  const existing = await getExistingDataPreviewForSection(
    origin.section.id,
    target.document.id,
    previewReferences(context),
  );

  return json({
    originDocumentName: origin.document.title,
    targetDocumentName: target.document.title,
    originSectionName: origin.section.title ?? '',
    targetSectionName: target.section?.title ?? '',
    originalLanguage: origin.document.language,
    translationLanguage: target.document.language,
    ...columnKeys(context),
    existing,
  });
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request, params }: ActionFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');
  const t = await getFixedT(request);
  if (defineAbilityFor(user).cannot('Maintain', 'TranslationData')) {
    return json<ActionResponse>(
      { intent: 'error', result: { success: false, message: t('data:projects.import.errors.notAuthorised') } },
      { status: 403 },
    );
  }

  const { projectId, sectionId } = params;
  const context = projectId && sectionId ? await resolveImportContext(projectId, sectionId) : null;
  if (!context) {
    return json<ActionResponse>(
      { intent: 'error', result: { success: false, message: t('data:projects.import.result.originNotFound') } },
      { status: 404 },
    );
  }

  const formData = await request.formData();
  const intent = formData.get('intent') as string;

  // ── Preview: parse file only ──
  if (intent === 'preview') {
    const file = formData.get('file') as File;

    if (!file) {
      return json<ActionResponse>(
        { intent: 'error', result: { success: false, message: t('data:projects.import.errors.noFile') } },
        { status: 400 },
      );
    }

    // Columns are identified by each document's key. Every key is optional —
    // the file may carry any subset of documents — so we pass whatever keys
    // exist and let the parser match the columns that are present. Reference
    // keys let it recognise their `<key>.<field>` metadata columns.
    const keys = columnKeys(context);

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
            result: { success: false, message: t('data:projects.import.errors.invalidType') },
          },
          { status: 400 },
        );
      }

      if (rows.length === 0) {
        return json<ActionResponse>(
          {
            intent: 'error',
            result: { success: false, message: t('data:projects.import.errors.noRows') },
          },
          { status: 400 },
        );
      }

      return json<ActionResponse>({ intent: 'preview', fileRows: rows });
    } catch (error) {
      console.error('Preview error:', error);
      return json<ActionResponse>(
        {
          intent: 'error',
          result: {
            success: false,
            message: t('data:projects.import.errors.parseFailed', { error: localizeError(error, t) }),
          },
        },
        { status: 500 },
      );
    }
  }

  // ── Replace: insert parsed rows into the database ──
  if (intent === 'replace') {
    const rowsJson = formData.get('rows') as string;

    if (!rowsJson) {
      return json<ActionResponse>(
        { intent: 'error', result: { success: false, message: t('data:projects.import.errors.missingData') } },
        { status: 400 },
      );
    }

    const rows: ExcelTranslationRow[] = JSON.parse(rowsJson);
    const result = await replaceSectionData(rows, context, user.id, t);

    return json<ActionResponse>({ intent: 'replace', result });
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DataImport() {
  const {
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
  const { t } = useTranslation('data');

  const fileRows = actionData?.intent === 'preview' ? actionData.fileRows : null;
  const replaceResult = actionData?.intent === 'replace' ? actionData.result : null;
  const errorResult = actionData?.intent === 'error' ? actionData.result : null;

  return (
    <div className="container mx-auto max-w-5xl p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-primary text-2xl">{t('projects.import.title')}</CardTitle>
          <CardDescription className="text-base">
            {originKey || targetKey ? (
              <Trans
                t={t}
                components={{ strong: <strong /> }}
                i18nKey="projects.import.descriptionWithKeys"
                values={{
                  origin: originKey ?? t('projects.import.originPlaceholder'),
                  target: targetKey ?? t('projects.import.translationPlaceholder'),
                }}
              />
            ) : (
              t('projects.import.description')
            )}
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
          {/* Translation columns can't be imported until the counterpart section is named. */}
          {!targetSectionName.trim() && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{t('projects.import.result.translationSectionMissing')}</AlertDescription>
            </Alert>
          )}
          <FileUploadForm
            fileName={fileName}
            errorResult={errorResult}
            isSubmitting={isSubmitting}
            replaceResult={replaceResult}
            navigationIntent={navigationIntent}
            onFileChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
          />
        </CardContent>
      </Card>

      <DataComparisonPanel
        existing={existing}
        fileRows={fileRows}
        isSubmitting={isSubmitting}
        navigationIntent={navigationIntent}
      />

      <ImportInstructions originKey={originKey} targetKey={targetKey} referenceKeys={referenceKeys} />
    </div>
  );
}
