import { type LoaderFunctionArgs } from '@vercel/remix';

import { assertAuthUser } from '../auth.server';
import { readParagraphsByRollId } from '../services/paragraph.service';

// Helper to escape CSV characters
const escapeCsv = (str: string | null | undefined) => {
  if (!str) return '';
  const stringValue = String(str);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

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

  // 2. Define CSV Headers

  // Collect all unique reference names found in this dataset to build columns dynamically
  const standardHeaders = ['Origin', 'Translation'];

  // Let's find all unique reference sources (e.g., 'Cleary', 'Kalavinka') present in the data
  const referenceSources = new Set<string>();
  paragraphs.forEach((p) => {
    p.references.forEach((r) => {
      if (r.sutraName) referenceSources.add(r.sutraName);
    });
  });

  const refHeaders = Array.from(referenceSources).sort();
  console.log('--- Detected Reference Sources ---', refHeaders);

  // Build header row: Origin, Translation, [RefName1], [RefName1_page], [RefName2]...
  const csvHeaders = [...standardHeaders];
  refHeaders.forEach((source) => {
    csvHeaders.push(source);
    // csvHeaders.push(`${source}_location`);
  });

  // 3. Build CSV Rows
  const csvRows = paragraphs.map((p, index) => {
    const rowData: Record<string, string> = {
      label: p.id, // TODO add ref_code
      Origin: p.origin || '',
      Translation: p.target || '',
    };

    // Fill reference columns
    refHeaders.forEach((source) => {
      // Find the reference in this paragraph that matches the source name
      const ref = p.references.find((r) => r.sutraName === source);

      if (ref) {
        rowData[source] = ref.content || '';
        // TODO: add location field (holds page number) and export
        // rowData[`${source}_location`] = ref.location : '';
      } else {
        rowData[source] = '';
        // rowData[`${source}_location`] = '';
      }
    });

    // --- DEBUGGING: Log specific rows if they look weird ---
    // Example: Log the first row's processed data
    if (index === 0) {
      console.log('--- Processed Row [0] Data ---', rowData);
    }

    // Map to array order of headers
    return csvHeaders.map((header) => escapeCsv(rowData[header])).join(',');
  });

  // Combine Header and Rows
  const csvString = [csvHeaders.join(','), ...csvRows].join('\n');

  // 4. Return as File Download
  // Add BOM for Excel compatibility with UTF-8 characters (Chinese)
  const bom = '\uFEFF';
  const filename = `${'export'}_${new Date().toISOString().split('T')[0]}.csv`;

  return new Response(bom + csvString, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
