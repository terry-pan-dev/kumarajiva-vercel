/**
 * =============================================================================
 * file.server.ts  —  SERVER-ONLY
 * =============================================================================
 *
 * DB-backed helpers for file import/export. Only import this from:
 *   - Remix loaders  (loader function in route files)
 *   - Remix actions  (action function in route files)
 *   - Other *.server.ts files
 *
 * Never import this from component code or any file without a .server.ts
 * suffix — it will pull Drizzle/DB modules into the client bundle.
 *
 * Client-safe types and parsing utilities live in:
 *   ~/services/file.service.ts
 */

import 'dotenv/config';
import { eq, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

import { paragraphsTable, referencesTable } from '~/drizzle/schema';
import { getDb } from '~/lib/db.server';
import { PREVIEW_LIMIT } from '~/utils/constants';

import {
  type ExcelTranslationRow,
  type ExistingDataPreview,
  type ImportOptions,
  type ImportResult,
} from './file.service';
import { readParagraphsByRollIdForLanguage } from './paragraph.service';
import { saveParagraphsToAlgolia, updateParagraphsToAlgolia } from './search.server';

export const db = getDb();

/**
 * Pure computation — builds the three insert arrays from file rows and import
 * options.  No DB I/O; safe to call and unit-test without a database.
 */
export function buildImportData(rows: ExcelTranslationRow[], options: ImportOptions) {
  const { originRollId, targetRollId, originalLanguage, translationLanguage, userId } = options;

  const originParagraphs = rows.map((row, idx) => ({
    id: uuidv4(),
    rollId: originRollId,
    number: idx + 1,
    order: String(idx + 1),
    language: originalLanguage as (typeof paragraphsTable.language.enumValues)[number],
    content: row.origin,
    createdBy: userId,
    updatedBy: userId,
  }));

  const targetParagraphs = rows
    .map((row, idx) => {
      if (!row.target) return null;
      return {
        id: uuidv4(),
        rollId: targetRollId,
        parentId: originParagraphs[idx].id,
        number: idx + 1,
        order: String(idx + 1),
        language: translationLanguage as (typeof paragraphsTable.language.enumValues)[number],
        content: row.target,
        createdBy: userId,
        updatedBy: userId,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const referencesToInsert = rows.flatMap((row, idx) =>
    row.references
      .filter((r) => r.sutraName && r.content)
      .map((r) => ({
        paragraphId: originParagraphs[idx].id,
        order: String(idx + 1),
        sutraName: r.sutraName!,
        content: r.content!,
        createdBy: userId,
        updatedBy: userId,
      })),
  );

  return { originParagraphs, targetParagraphs, referencesToInsert };
}

/**
 * Upsert imported rows into the roll, matching by order position:
 *   - Existing paragraph at position N → UPDATE content (and its child translation)
 *   - No existing paragraph at position N → INSERT new paragraph (and child)
 *   - Extra existing paragraphs beyond imported count → "park" by negating number/order
 *
 * References for each updated/inserted origin paragraph are replaced wholesale.
 * Parked paragraphs (and their children) are excluded from all reads via the
 * `number >= 0` filter applied in crud.server.ts.
 */
export async function replaceRollData(rows: ExcelTranslationRow[], options: ImportOptions): Promise<ImportResult> {
  const { originRollId, targetRollId, originalLanguage, translationLanguage, userId } = options;
  const { originParagraphs, targetParagraphs, referencesToInsert } = buildImportData(rows, options);

  try {
    const { counts, algoliaUpdates, algoliaInserts } = await db.transaction(async (tx) => {
      // ── 1. Load existing origin paragraphs (non-parked) sorted by position ─
      const existingOrigins = await tx.query.paragraphsTable.findMany({
        where: (p, { eq, and, gte, isNull }) =>
          and(
            eq(p.rollId, originRollId),
            eq(p.language, originalLanguage as any),
            isNull(p.parentId),
            gte(p.number, 0),
          ),
        with: { children: true, references: true },
        orderBy: (p, { asc }) => [asc(p.number), asc(p.order)],
      });

      let updatedCount = 0;
      let insertedCount = 0;

      // Collected during the loop; bulk-inserted / synced to Algolia after.
      const newOriginRows: any[] = [];
      const newTargetRows: any[] = [];
      const newRefRows: any[] = [];
      const refDeleteIds: string[] = [];
      const refInserts: any[] = [];
      const algoliaUpdates: { searchId: string; data: object }[] = [];
      const algoliaInserts: any[] = [];

      // ── 2. Update or insert one paragraph per imported row ────────────────
      for (let idx = 0; idx < rows.length; idx++) {
        const row = rows[idx];
        const existing = existingOrigins[idx];
        const paraNumber = idx + 1;
        const paraOrder = String(idx + 1);

        if (existing) {
          // UPDATE existing origin paragraph
          const paragraphData = {
            content: row.origin,
            number: paraNumber,
            order: paraOrder,
            updatedBy: userId,
          };
          await tx.update(paragraphsTable).set(paragraphData).where(eq(paragraphsTable.id, existing.id));

          if (existing.searchId) {
            algoliaUpdates.push({ searchId: existing.searchId, data: paragraphData });
          }

          // UPDATE or INSERT translation child
          const child = existing.children;
          if (row.target) {
            if (child) {
              const paragraphData = {
                content: row.target,
                number: paraNumber,
                order: paraOrder,
                updatedBy: userId,
              };
              await tx.update(paragraphsTable).set(paragraphData).where(eq(paragraphsTable.id, child.id));

              if (child.searchId) {
                algoliaUpdates.push({ searchId: child.searchId, data: paragraphData });
              }
            } else {
              const newParagraphData = {
                id: uuidv4(),
                rollId: targetRollId,
                parentId: existing.id,
                number: paraNumber,
                order: paraOrder,
                language: translationLanguage as (typeof paragraphsTable.language.enumValues)[number],
                content: row.target,
                searchId: uuidv4(),
                createdBy: userId,
                updatedBy: userId,
              };
              await tx.insert(paragraphsTable).values(newParagraphData);
              algoliaInserts.push(newParagraphData);
            }
          }

          // Collect reference replacements — bulk delete/insert after the loop.
          const newRefs = row.references.filter((r) => r.sutraName && r.content);
          if (newRefs.length > 0) {
            refDeleteIds.push(existing.id);
            refInserts.push(
              ...newRefs.map((r) => ({
                paragraphId: existing.id,
                order: paraOrder,
                sutraName: r.sutraName!,
                content: r.content!,
                createdBy: userId,
                updatedBy: userId,
              })),
            );
          }

          updatedCount++;
        } else {
          // Collect new rows — bulk-inserted after the loop.
          const newOrigin = { ...originParagraphs[idx], searchId: uuidv4() };
          newOriginRows.push(newOrigin);
          algoliaInserts.push(newOrigin);

          const builtTarget = targetParagraphs.find((t) => t.parentId === originParagraphs[idx].id);
          if (builtTarget) {
            const newTarget = { ...builtTarget, searchId: uuidv4() };
            newTargetRows.push(newTarget);
            algoliaInserts.push(newTarget);
          }

          newRefRows.push(...referencesToInsert.filter((r) => r.paragraphId === originParagraphs[idx].id));

          insertedCount++;
        }
      }

      // ── 2b. Bulk operations for all collected rows ────────────────────────
      if (refDeleteIds.length > 0) {
        await tx.delete(referencesTable).where(inArray(referencesTable.paragraphId, refDeleteIds));
      }
      if (refInserts.length > 0) {
        await tx.insert(referencesTable).values(refInserts);
      }
      if (newOriginRows.length > 0) {
        await tx.insert(paragraphsTable).values(newOriginRows);
      }
      if (newTargetRows.length > 0) {
        await tx.insert(paragraphsTable).values(newTargetRows);
      }
      if (newRefRows.length > 0) {
        await tx.insert(referencesTable).values(newRefRows);
      }

      // ── 3. Park extra existing paragraphs (negate number/order) ──────────
      const extras = existingOrigins.slice(rows.length);
      for (const extra of extras) {
        const negNumber = extra.number > 0 ? -extra.number : extra.number;
        const negOrder = extra.order.startsWith('-') ? extra.order : `-${extra.order}`;
        await tx
          .update(paragraphsTable)
          .set({ number: negNumber, order: negOrder, updatedBy: userId })
          .where(eq(paragraphsTable.id, extra.id));

        if (extra.children) {
          const childNegNumber = extra.children.number > 0 ? -extra.children.number : extra.children.number;
          const childNegOrder = extra.children.order.startsWith('-')
            ? extra.children.order
            : `-${extra.children.order}`;
          await tx
            .update(paragraphsTable)
            .set({ number: childNegNumber, order: childNegOrder, updatedBy: userId })
            .where(eq(paragraphsTable.id, extra.children.id));
        }
      }

      return { counts: { updatedCount, insertedCount, parkedCount: extras.length }, algoliaUpdates, algoliaInserts };
    });

    // ── 4. Sync to Algolia after the transaction commits ──────────────────
    // Uses allSettled so search failures never roll back committed DB data.
    const algoliaResults = await Promise.allSettled([
      updateParagraphsToAlgolia(algoliaUpdates),
      saveParagraphsToAlgolia(algoliaInserts),
    ]);

    const searchErrors = algoliaResults
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => `Search sync failed: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);

    if (searchErrors.length > 0) {
      console.error('Algolia sync errors after import:', searchErrors);
    }

    return {
      success: true,
      inserted: counts.insertedCount,
      deleted: counts.parkedCount,
      message: `Updated ${counts.updatedCount} paragraph(s), inserted ${counts.insertedCount} new, parked ${counts.parkedCount} extra.`,
      ...(searchErrors.length > 0 && { errors: searchErrors }),
    };
  } catch (error) {
    console.error('replaceRollData error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `Failed to replace data: ${errorMessage}`,
      errors: [errorMessage],
    };
  }
}

/**
 * Fetch a preview of the existing data for a roll from the database.
 *
 * Returns a limited slice of paragraphs (up to PREVIEW_LIMIT) plus
 * aggregate counts so the UI can show what will be replaced before the
 * user confirms an import.
 */
export async function getExistingDataPreviewForRollId(
  rollId: string,
  language: (typeof paragraphsTable.language.enumValues)[number],
): Promise<ExistingDataPreview> {
  const databaseParagraphs = await readParagraphsByRollIdForLanguage({ rollId, language });

  const totalParagraphs = databaseParagraphs.length;
  const totalReferences = databaseParagraphs.reduce((sum, p) => sum + (p.references?.length || 0), 0);

  return {
    paragraphs: databaseParagraphs.slice(0, PREVIEW_LIMIT).map((p) => ({
      id: p.id,
      order: p.order,
      origin: p.origin,
      targetId: p.targetId,
      target: p.target,
      references: (p.references || []).map((r) => ({
        id: r.id,
        order: r.order,
        sutraName: r.sutraName ?? '',
        content: r.content ?? '',
      })),
    })),
    totalParagraphs,
    totalReferences,
  };
}
