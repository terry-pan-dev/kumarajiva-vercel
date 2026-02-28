import { type LoaderFunctionArgs } from '@vercel/remix';

import { assertAuthUser } from '~/auth.server';
import { buildExportFilename, buildExportWorkbook, toExcelRows } from '~/services/file.service';
import { readParagraphsByRollId } from '~/services/paragraph.service';

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { rollId } = params;
  if (!rollId) throw new Response('Roll ID required', { status: 400 });

  const user = await assertAuthUser(request);
  if (!user) throw new Response('Unauthorized', { status: 401 });

  const paragraphs = await readParagraphsByRollId(rollId);

  if (!paragraphs.length) {
    throw new Response('No data found for this roll', { status: 404 });
  }

  const workbook = await buildExportWorkbook(toExcelRows(paragraphs));
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
