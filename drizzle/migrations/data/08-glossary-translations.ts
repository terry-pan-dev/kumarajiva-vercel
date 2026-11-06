/**
 * Copies every term's `glossaries.translations` JSON array into `glossary_translations`,
 * one row per element. Live and trashed terms are both copied. See
 * docs/plans/glossary-refactor.md (step 2) and the mapping in ./08-glossary-translations.rows.ts.
 *
 *   pnpm db:migrate:data:08                  dry run against .env: reports what would be copied
 *   pnpm db:migrate:data:08 --apply          copies into the .env database
 *   pnpm db:migrate:data:08:prod [--apply]   the same against .env.prod
 *
 * Needs schema migration 0025 (the table) for --apply. A dry run works without it.
 *
 * --apply runs in one transaction:
 *   - locks `glossaries` against writes (edits made meanwhile wait, then go to the JSON,
 *     which the app still uses until the code switch);
 *   - refuses if `glossary_translations` already has rows (no double copy);
 *   - refuses if any blocking issue is found;
 *   - inserts, then reads everything back and compares it with the planned rows;
 *     any difference rolls the whole copy back.
 *
 * The JSON column is not touched.
 */

import 'dotenv/config';
import { Pool } from '@neondatabase/serverless';
import { count, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-serverless';

import * as schema from '~/drizzle/schema';
import { glossariesTable, glossaryTranslationsTable } from '~/drizzle/tables/glossary';

import { type Issue, isBlocking, type MigrationPlan, planMigration, verifyRows } from './08-glossary-translations.rows';

const apply = process.argv.includes('--apply');
const BATCH = 1000;
const SAMPLE = 10;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const loadTerms = (client: typeof db | Tx) =>
  client
    .select({
      id: glossariesTable.id,
      glossary: glossariesTable.glossary,
      translations: glossariesTable.legacyTranslations,
      updatedAt: glossariesTable.updatedAt,
      updatedBy: glossariesTable.updatedBy,
      deletedAt: glossariesTable.deletedAt,
    })
    .from(glossariesTable);

// Computed by Postgres, independently of the script's own counting.
async function sqlElementCount(client: typeof db | Tx) {
  const result = await client.execute<{ n: string | null }>(
    sql`select sum(json_array_length(translations)) as n from glossaries where json_typeof(translations) = 'array'`,
  );
  return Number(result.rows[0]?.n ?? 0);
}

async function tableExists() {
  const result = await db.execute<{ t: string | null }>(sql`select to_regclass('public.glossary_translations') as t`);
  return result.rows[0]?.t !== null;
}

function report(plan: MigrationPlan, sqlElements: number) {
  const languages = new Map<string, number>();
  for (const row of plan.rows) languages.set(row.language, (languages.get(row.language) ?? 0) + 1);
  const withMetadata = plan.rows.filter((r) => r.metadata).length;
  const duplicateRows = plan.duplicates.reduce((n, d) => n + d.positions.length - 1, 0);

  console.log(`terms:                     ${plan.terms} (${plan.trashedTerms} trashed)`);
  console.log(`translations in the JSON:  ${plan.elements} (Postgres counts ${sqlElements})`);
  console.log(`rows to copy:              ${plan.rows.length}`);
  console.log(`by language:               ${[...languages].map(([l, n]) => `${l} ${n}`).join(', ') || '-'}`);
  console.log(`rows with metadata:        ${withMetadata}`);
  console.log(
    `duplicates (kept):         ${duplicateRows} extra row(s) in ${plan.duplicates.length} group(s), by translationKey()`,
  );
  for (const d of plan.duplicates.slice(0, SAMPLE)) {
    console.log(`  ${d.term} (${d.glossaryId}) positions ${d.positions.join(', ')}`);
  }
  if (plan.duplicates.length > SAMPLE) console.log('  …');

  const byKind = new Map<string, Issue[]>();
  for (const issue of plan.issues) byKind.set(issue.kind, [...(byKind.get(issue.kind) ?? []), issue]);
  if (byKind.size === 0) {
    console.log('issues:                    none');
    return;
  }
  console.log('issues:');
  for (const [kind, issues] of byKind) {
    console.log(`  ${isBlocking(issues[0].kind) ? 'BLOCKING' : 'warning '} ${kind}: ${issues.length}`);
    for (const i of issues.slice(0, SAMPLE)) {
      const where = i.position === null ? '' : ` [${i.position}]`;
      console.log(`    ${i.term} (${i.glossaryId})${where}${i.detail ? `: ${i.detail}` : ''}`);
    }
    if (issues.length > SAMPLE) console.log('    …');
  }
}

function checkPlan(plan: MigrationPlan, sqlElements: number): string[] {
  const problems: string[] = [];
  const blocking = plan.issues.filter((i) => isBlocking(i.kind)).length;
  if (blocking > 0) problems.push(`${blocking} blocking issue(s)`);
  if (plan.elements !== sqlElements) problems.push(`script counts ${plan.elements} elements, Postgres ${sqlElements}`);
  if (blocking === 0 && plan.rows.length !== plan.elements) {
    problems.push(`${plan.rows.length} rows planned for ${plan.elements} elements`);
  }
  return problems;
}

async function dryRun() {
  console.log('Dry run — nothing will be written.\n');
  const [terms, sqlElements, exists] = await Promise.all([loadTerms(db), sqlElementCount(db), tableExists()]);
  const plan = planMigration(terms);
  report(plan, sqlElements);

  console.log();
  if (!exists) {
    console.log('glossary_translations does not exist yet: apply schema migration 0025 before --apply.');
  } else {
    const [{ value }] = await db.select({ value: count() }).from(glossaryTranslationsTable);
    if (value > 0) console.log(`glossary_translations already has ${value} rows: --apply would refuse.`);
  }
  const problems = checkPlan(plan, sqlElements);
  if (problems.length > 0) console.log(`--apply would refuse: ${problems.join('; ')}.`);
  else console.log('Run again with --apply to copy.');
}

async function applyCopy() {
  console.log('Copying glossary translations…\n');
  if (!(await tableExists()))
    throw new Error('glossary_translations does not exist: apply schema migration 0025 first');

  await db.transaction(async (tx) => {
    // Blocks writes to glossaries (reads continue) until the copy commits or rolls back.
    await tx.execute(sql`lock table glossaries in share mode`);

    const [{ value: existing }] = await tx.select({ value: count() }).from(glossaryTranslationsTable);
    if (existing > 0) throw new Error(`glossary_translations already has ${existing} rows: refusing to copy twice`);

    const [terms, sqlElements] = await Promise.all([loadTerms(tx), sqlElementCount(tx)]);
    const plan = planMigration(terms);
    report(plan, sqlElements);

    const problems = checkPlan(plan, sqlElements);
    if (problems.length > 0) throw new Error(`refusing to copy: ${problems.join('; ')}`);

    for (let i = 0; i < plan.rows.length; i += BATCH) {
      await tx.insert(glossaryTranslationsTable).values(plan.rows.slice(i, i + BATCH));
    }
    console.log(`\ninserted ${plan.rows.length} rows; verifying…`);

    const stored = await tx.select().from(glossaryTranslationsTable);
    const mismatches = verifyRows(plan.rows, stored);
    if (mismatches.length > 0) {
      for (const m of mismatches.slice(0, SAMPLE)) console.error(`  ${JSON.stringify(m)}`);
      throw new Error(`verification failed: ${mismatches.length} mismatch(es); rolled back`);
    }
    console.log(`verified: ${stored.length} rows match the plan field by field.`);
  });
  console.log('Committed.');
}

(apply ? applyCopy() : dryRun())
  .then(() => pool.end())
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await pool.end();
    process.exit(1);
  });
