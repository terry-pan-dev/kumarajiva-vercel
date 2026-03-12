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
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

import { paragraphsTable, referencesTable } from '~/drizzle/schema';
import { getDb } from '~/lib/db.server';
import { DEFAULT_ORIGIN_LANG, PREVIEW_LIMIT } from '~/utils/constants';

import {
  type ExcelTranslationRow,
  type ExistingDataPreview,
  type ImportOptions,
  type ImportResult,
} from './file.service';
import { readParagraphsByRollIdForLanguage } from './paragraph.service';
import { saveParagraphToAlgolia, updateParagraphToAlgolia } from './search.server';

export const db = getDb();

/**
 * Pure computation — builds the three insert arrays from file rows and import
 * options.  No DB I/O; safe to call and unit-test without a database.
 */
export function buildImportData(rows: ExcelTranslationRow[], options: ImportOptions) {
  const { rollId, originalLanguage, translationLanguage, userId } = options;

  const originParagraphs = rows.map((row, idx) => ({
    id: uuidv4(),
    rollId,
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
        rollId,
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
  const { rollId, originalLanguage, translationLanguage, userId } = options;
  const { originParagraphs, targetParagraphs, referencesToInsert } = buildImportData(rows, options);

  try {
    const counts = await db.transaction(async (tx) => {
      // ── 1. Load existing origin paragraphs (non-parked) sorted by position ─
      const existingOrigins = await tx.query.paragraphsTable.findMany({
        where: (p, { eq, and, gte, isNull }) =>
          and(eq(p.rollId, rollId), eq(p.language, originalLanguage as any), isNull(p.parentId), gte(p.number, 0)),
        with: { children: true, references: true },
        orderBy: (p, { asc }) => [asc(p.number), asc(p.order)],
      });

      let updatedCount = 0;
      let insertedCount = 0;

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
            await updateParagraphToAlgolia(existing.searchId, paragraphData);
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
                await updateParagraphToAlgolia(child.searchId, paragraphData);
              }
            } else {
              const newParagraphData = {
                id: uuidv4(),
                rollId,
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
              await saveParagraphToAlgolia(newParagraphData);
            }
          }

          // Replace references only if the imported row provides new ones
          const newRefs = row.references.filter((r) => r.sutraName && r.content);
          if (newRefs.length > 0) {
            await tx.delete(referencesTable).where(eq(referencesTable.paragraphId, existing.id));
            await tx.insert(referencesTable).values(
              newRefs.map((r) => ({
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
          // INSERT new origin paragraph using pre-built data from buildImportData
          const newParagraphData = { ...originParagraphs[idx], searchId: uuidv4() };
          await tx.insert(paragraphsTable).values(newParagraphData);
          await saveParagraphToAlgolia(newParagraphData);

          const builtTarget = targetParagraphs.find((t) => t.parentId === originParagraphs[idx].id);
          if (builtTarget) {
            const newTargetData = { ...builtTarget, searchId: uuidv4() };
            await tx.insert(paragraphsTable).values(newTargetData);
            await saveParagraphToAlgolia(newTargetData);
          }

          const newRefs = referencesToInsert.filter((r) => r.paragraphId === originParagraphs[idx].id);
          if (newRefs.length > 0) {
            await tx.insert(referencesTable).values(newRefs);
          }

          insertedCount++;
        }
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

      return { updatedCount, insertedCount, parkedCount: extras.length };
    });

    return {
      success: true,
      inserted: counts.insertedCount,
      deleted: counts.parkedCount,
      message: `Updated ${counts.updatedCount} paragraph(s), inserted ${counts.insertedCount} new, parked ${counts.parkedCount} extra.`,
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
export async function getExistingDataPreviewForRollId(rollId: string): Promise<ExistingDataPreview> {
  const databaseParagraphs = await readParagraphsByRollIdForLanguage({ rollId, language: DEFAULT_ORIGIN_LANG });

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
