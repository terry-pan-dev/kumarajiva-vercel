// Exports a section's paragraphs to xlsx from the refactored data model
// (paragraphs_new): origin rows from the section, translations paired from the
// project's target document via passage_key. References are legacy-only and
// therefore not part of the export until they migrate.
import { type LoaderFunctionArgs } from '@vercel/remix';

import { assertAuthUser } from '~/auth.server';
import { buildExportFilename, buildExportWorkbook, type ExcelTranslationRow } from '~/services/file.service';
import { getProjectBySourceDocumentId } from '~/services/project.service';
import { getSection, readParagraphsBySectionId } from '~/services/text.service';

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { sectionId } = params;
  if (!sectionId) throw new Response('Section ID required', { status: 400 });

  const user = await assertAuthUser(request);
  if (!user) throw new Response('Unauthorized', { status: 401 });

  const section = await getSection(sectionId);
  if (!section) throw new Response('Section not found', { status: 404 });

  // Translations live in the project's target document, paired by passage_key.
  const project = await getProjectBySourceDocumentId(section.documentId);
  const paragraphs = await readParagraphsBySectionId({
    sectionId,
    targetDocumentId: project?.targetDocumentId ?? undefined,
  });

  if (!paragraphs.length) {
    throw new Response('No data found for this section', { status: 404 });
  }

  const rows: ExcelTranslationRow[] = paragraphs.map((p) => ({
    origin: p.origin,
    target: p.target,
    references: [],
  }));

  const workbook = await buildExportWorkbook(rows);
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
