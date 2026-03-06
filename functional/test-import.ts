/**
 * Manual functional test for the import pipeline.
 *
 * Tests parseCSV and parseXLSX end-to-end with realistic data and prints the
 * results so you can visually verify they are correct before running an actual
 * DB import.
 *
 * Run with:
 *   tsx scripts/test-import.ts
 *
 * To also exercise replaceRollData against a real database, pass --db and make
 * sure the DATABASE_URL / POSTGRES_URL env vars are set (e.g. via .env):
 *   dotenv -e .env -- tsx scripts/test-import.ts --db
 */

import 'dotenv/config';
import ExcelJS from 'exceljs';

import { parseCSV, parseXLSX } from '../app/services/file.service';

const DB_MODE = process.argv.includes('--db');

// ─── Sample data ─────────────────────────────────────────────────────────────

const SAMPLE_ROWS = [
  { origin: '諸法因緣生', target: 'All dharmas arise from causes and conditions', ref: 'Diamond Sutra chapter 1' },
  { origin: '諸法因緣滅', target: 'All dharmas cease through causes and conditions', ref: '' },
  { origin: '自性本清淨', target: null, ref: 'Platform Sutra verse 3' },
];

// ─── CSV test ────────────────────────────────────────────────────────────────

async function testCSV() {
  const header = 'origin,translation,Diamond Sutra,Platform Sutra';
  const dataLines = SAMPLE_ROWS.map((r, idx) => {
    const ref1 = idx === 0 ? r.ref : '';
    const ref2 = idx === 2 ? r.ref : '';
    return `${r.origin},${r.target ?? ''},${ref1},${ref2}`;
  });
  const csv = [header, ...dataLines].join('\n');

  console.log('── CSV input ────────────────────────────────────────');
  console.log(csv);

  const rows = await parseCSV(csv);

  console.log('\n── Parsed CSV rows ──────────────────────────────────');
  console.log(JSON.stringify(rows, null, 2));

  // Basic assertions
  if (rows.length !== 3) throw new Error(`Expected 3 rows, got ${rows.length}`);
  if (rows[0].origin !== '諸法因緣生') throw new Error('Row 0 origin mismatch');
  if (rows[0].references.length !== 1) throw new Error('Row 0 should have 1 reference');
  if (rows[0].references[0].sutraName !== 'Diamond Sutra') throw new Error('Reference sutraName mismatch');
  if (rows[1].references.length !== 0) throw new Error('Row 1 should have no references');
  if (rows[2].target !== null) throw new Error('Row 2 target should be null');
  if (rows[2].references[0].sutraName !== 'Platform Sutra') throw new Error('Row 2 reference sutraName mismatch');

  console.log('\n✓ CSV assertions passed');
}

// ─── XLSX test ───────────────────────────────────────────────────────────────

async function testXLSX() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Translation Data');
  ws.columns = [
    { header: 'origin', key: 'origin', width: 40 },
    { header: 'Translation', key: 'target', width: 40 },
    { header: 'Diamond Sutra', key: 'ref1', width: 40 },
    { header: 'Platform Sutra', key: 'ref2', width: 40 },
  ];

  ws.addRow({ origin: '諸法因緣生', target: 'All dharmas arise', ref1: 'Diamond Sutra ch1', ref2: '' });
  ws.addRow({ origin: '諸法因緣滅', target: 'All dharmas cease', ref1: '', ref2: '' });
  ws.addRow({ origin: '自性本清淨', target: '', ref1: '', ref2: 'Platform Sutra v3' });

  const buffer = await wb.xlsx.writeBuffer();
  const rows = await parseXLSX(buffer as ArrayBuffer);

  console.log('\n── Parsed XLSX rows ─────────────────────────────────');
  console.log(JSON.stringify(rows, null, 2));

  if (rows.length !== 3) throw new Error(`Expected 3 rows, got ${rows.length}`);
  if (rows[0].references[0].sutraName !== 'Diamond Sutra') throw new Error('XLSX reference sutraName mismatch');
  if (rows[2].target !== null) throw new Error('Row 2 target should be null');
  if (rows[2].references[0].sutraName !== 'Platform Sutra') throw new Error('XLSX row 2 ref mismatch');

  console.log('\n✓ XLSX assertions passed');
}

// ─── DB test (opt-in) ────────────────────────────────────────────────────────

async function testDB() {
  console.log('\n── DB import test ───────────────────────────────────');
  console.log('Requires ROLL_ID env var and a running database.');

  const rollId = process.env.TEST_ROLL_ID;
  if (!rollId) {
    console.log('  Skipped — set TEST_ROLL_ID to run this section.');
    return;
  }

  // Lazy import so it only bootstraps the DB when --db flag is passed
  const { replaceRollData } = await import('../app/services/file.server');
  const { buildImportData } = await import('../app/services/file.server');

  const rows = [
    {
      origin: 'Test origin 1',
      target: 'Test translation 1',
      references: [{ sutraName: 'Test Sutra', content: 'test ref' }],
    },
    { origin: 'Test origin 2', target: null, references: [] },
  ];

  const options = {
    sutraId: process.env.TEST_SUTRA_ID ?? '',
    rollId,
    sutraName: 'Test Sutra',
    originalLanguage: 'chinese',
    translationLanguage: 'english',
    userId: process.env.TEST_USER_ID ?? 'test-user',
  };

  console.log('  buildImportData output:');
  console.log(JSON.stringify(buildImportData(rows, options), null, 2));

  console.log('  Calling replaceRollData...');
  const result = await replaceRollData(rows, options);
  console.log('  Result:', JSON.stringify(result, null, 2));

  if (!result.success) throw new Error(`replaceRollData failed: ${result.message}`);
  console.log('\n✓ DB import assertions passed');
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Import Pipeline Functional Test ===\n');
  await testCSV();
  await testXLSX();
  if (DB_MODE) await testDB();
  console.log('\n=== All tests passed ===');
}

main().catch((err) => {
  console.error('\n✗ Test failed:', err.message);
  process.exit(1);
});
