// Exports a section's paragraphs to xlsx from the refactored data model
// (paragraphs_new): origin rows from the section, with the translation and each
// of the project's references paired by passage_key. Columns are headed by
// document keys and paragraph metadata goes in `<key>.<field>` columns, so the
// file can be edited and re-imported as is.
import { type LoaderFunctionArgs } from '@vercel/remix';

import { assertAuthUser } from '~/auth.server';
import {
  buildExportFilename,
  buildExportWorkbook,
  sectionExportColumns,
  sectionExportDocuments,
} from '~/services/file.service';
import { getProjectBySourceDocumentId, getProjectReferences } from '~/services/project.service';
import { getDocument, getSection, readParagraphsBySectionId } from '~/services/text.service';

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { sectionId } = params;
  if (!sectionId) throw new Response('Section ID required', { status: 400 });

  const user = await assertAuthUser(request);
  if (!user) throw new Response('Unauthorized', { status: 401 });

  const section = await getSection(sectionId);
  if (!section) throw new Response('Section not found', { status: 404 });

  // Translations live in the project's target document; references are the
  // project's reference documents. Both pair by passage_key.
  const project = await getProjectBySourceDocumentId(section.documentId);
  const [references, originDocument, targetDocument] = await Promise.all([
    project ? getProjectReferences(project.id) : Promise.resolve([]),
    getDocument(section.documentId),
    project ? getDocument(project.targetDocumentId) : Promise.resolve(undefined),
  ]);
  const paragraphs = await readParagraphsBySectionId({
    sectionId,
    targetDocumentId: project?.targetDocumentId ?? undefined,
    references,
  });

  if (!paragraphs.length) {
    throw new Response('No data found for this section', { status: 404 });
  }

  const documents = sectionExportDocuments({
    originKey: originDocument?.key ?? null,
    targetKey: targetDocument?.key ?? null,
    references,
  });
  const workbook = await buildExportWorkbook(paragraphs, sectionExportColumns(paragraphs, documents));
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = buildExportFilename();

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
