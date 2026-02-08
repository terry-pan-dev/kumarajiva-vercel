import { type LoaderFunctionArgs } from '@vercel/remix';
import ExcelJS from 'exceljs';

import { assertAuthUser } from '../auth.server';
import { readParagraphsByRollId } from '../services/paragraph.service';

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { rollId } = params;
  if (!rollId) throw new Response('Roll ID required', { status: 400 });

  const user = await assertAuthUser(request);
  if (!user) throw new Response('Unauthorized', { status: 401 });

  // 1. Fetch Data
  const paragraphs = await readParagraphsByRollId({ rollId, user });

  // --- DEBUGGING START ---
  console.log(`\n=== EXPORT DEBUG: Roll ${rollId} ===`);
  console.log(`Found ${paragraphs.length} paragraphs.`);

  // Log the first paragraph fully to see the raw structure
  if (paragraphs.length > 0) {
    console.log('--- Sample Raw Paragraph [0] ---');
    console.dir(paragraphs[0], { depth: null, colors: true });
  }

  // If you want to see ALL raw data (warning: might be huge), uncomment below:
  // console.log(JSON.stringify(paragraphs, null, 2));
  // --- DEBUGGING END ---

  if (!paragraphs.length) {
    throw new Response('No data found for this roll', { status: 404 });
  }

  // 1. Create Workbook and Worksheet
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Translation Data');

  // 2. Setup Columns
  // We define the static columns first
  const columns = [
    { header: 'Origin', key: 'origin', width: 40 },
    { header: 'Translation', key: 'target', width: 40 },
  ];

  // Dynamically add columns for References (Cleary, Kalavinka, etc.)
  const referenceSources = new Set<string>();
  paragraphs.forEach((p) => {
    p.references.forEach((r) => {
      if (r.sutraName) referenceSources.add(r.sutraName);
    });
  });

  const refHeaders = Array.from(referenceSources).sort();
  console.log('--- Detected Reference Sources ---', refHeaders);

  // Build header row: Origin, Translation, [RefName1], [RefName1_page], [RefName2]...
  refHeaders.forEach((source) => {
    columns.push({ header: source, key: source, width: 40 });
    // columns.push({ header: `${source}_location`, key: `${source}_location`, width: 10 });
  });

  worksheet.columns = columns;

  // 3. Add Rows
  paragraphs.forEach((p) => {
    const rowValue: any = {
      label: p.id, // TODO add ref_code
      origin: p.origin || '',
      target: p.target || '',
    };

    refHeaders.forEach((source) => {
      // Find the reference in this paragraph that matches the source name
      const ref = p.references.find((r) => r.sutraName === source);
      rowValue[source] = ref?.content || '';
      // rowValue[`${source}_location`] = ref?.location || '';
    });

    worksheet.addRow(rowValue);
  });

  // 4. Styling (Make it look professional)
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };

  // Enable text wrapping for content cells so long paragraphs don't stretch forever
  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    });
  });

  // 5. Write to Buffer and Return Response
  const buffer = await workbook.xlsx.writeBuffer();

  const filename = `${'export'}_${new Date().toISOString()}.xlsx`;

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
