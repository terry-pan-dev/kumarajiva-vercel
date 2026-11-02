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
import { contextReferences, resolveSectionContext } from '~/services/project.service';
import { readParagraphsBySectionId } from '~/services/text.service';

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { projectId, sectionId } = params;
  if (!projectId || !sectionId) throw new Response('Project and section IDs required', { status: 400 });

  const user = await assertAuthUser(request);
  if (!user) throw new Response('Unauthorized', { status: 401 });

  // The URL names the project: a source document can belong to several.
  const context = await resolveSectionContext(projectId, sectionId);
  if (!context) throw new Response('Section not found', { status: 404 });

  // Translations live in the project's target document; references are the
  // project's reference documents. Both pair by passage_key.
  const references = contextReferences(context);
  const paragraphs = await readParagraphsBySectionId({
    sectionId: context.origin.section.id,
    targetDocumentId: context.target.document.id,
    references,
  });

  if (!paragraphs.length) {
    throw new Response('No data found for this section', { status: 404 });
  }

  const documents = sectionExportDocuments({
    originKey: context.origin.document.key,
    targetKey: context.target.document.key,
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
