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

import type { CreateParagraphNew } from '~/drizzle/schema';

import { paragraphsTable, paragraphsTableNew, referencesTable } from '~/drizzle/schema';
import { getDb } from '~/lib/db.server';
import { PREVIEW_LIMIT } from '~/utils/constants';

import {
  type ExcelTranslationRow,
  type ExistingDataPreview,
  type ImportOptions,
  type ImportOptionsNew,
  type ImportResult,
} from './file.service';
import { readParagraphsByRollIdForLanguage } from './paragraph.service';
import { saveParagraphsToAlgolia, updateParagraphsToAlgolia } from './search.server';
import { findTargetSection, getDocument, getSection, readParagraphsBySectionId } from './text.service';

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

      // Collected during the loop; executed in bulk after.
      const originUpdateOps: { id: string; data: object }[] = [];
      const childUpdateOps: { id: string; data: object }[] = [];
      const childInsertRows: any[] = [];
      const newOriginRows: any[] = [];
      const newTargetRows: any[] = [];
      const newRefRows: any[] = [];
      const refDeleteIds: string[] = [];
      const refInserts: any[] = [];
      const algoliaUpdates: { searchId: string; data: object }[] = [];
      const algoliaInserts: any[] = [];

      // ── 2. Classify rows into update vs insert buckets ────────────────────
      for (let idx = 0; idx < rows.length; idx++) {
        const row = rows[idx];
        const existing = existingOrigins[idx];
        const paraNumber = idx + 1;
        const paraOrder = String(idx + 1);

        if (existing) {
          const paragraphData = {
            rollId: originRollId,
            content: row.origin,
            number: paraNumber,
            order: paraOrder,
            updatedBy: userId,
          };
          originUpdateOps.push({ id: existing.id, data: paragraphData });
          if (existing.searchId) {
            algoliaUpdates.push({ searchId: existing.searchId, data: paragraphData });
          }

          const child = existing.children;
          if (row.target) {
            if (child) {
              const paragraphData = {
                rollId: targetRollId,
                content: row.target,
                number: paraNumber,
                order: paraOrder,
                updatedBy: userId,
              };
              childUpdateOps.push({ id: child.id, data: paragraphData });
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
              childInsertRows.push(newParagraphData);
              algoliaInserts.push(newParagraphData);
            }
          }

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
      await Promise.all([
        ...originUpdateOps.map((op) => tx.update(paragraphsTable).set(op.data).where(eq(paragraphsTable.id, op.id))),
        ...childUpdateOps.map((op) => tx.update(paragraphsTable).set(op.data).where(eq(paragraphsTable.id, op.id))),
      ]);
      if (refDeleteIds.length > 0) {
        await tx.delete(referencesTable).where(inArray(referencesTable.paragraphId, refDeleteIds));
      }
      if (refInserts.length > 0) {
        await tx.insert(referencesTable).values(refInserts);
      }
      if (childInsertRows.length > 0) {
        await tx.insert(paragraphsTable).values(childInsertRows);
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
      await Promise.all(
        extras.flatMap((extra) => {
          const negNumber = extra.number > 0 ? -extra.number : extra.number;
          const negOrder = extra.order.startsWith('-') ? extra.order : `-${extra.order}`;
          const ops = [
            tx
              .update(paragraphsTable)
              .set({ number: negNumber, order: negOrder, updatedBy: userId })
              .where(eq(paragraphsTable.id, extra.id)),
          ];
          if (extra.children) {
            const childNegNumber = extra.children.number > 0 ? -extra.children.number : extra.children.number;
            const childNegOrder = extra.children.order.startsWith('-')
              ? extra.children.order
              : `-${extra.children.order}`;
            ops.push(
              tx
                .update(paragraphsTable)
                .set({ number: childNegNumber, order: childNegOrder, updatedBy: userId })
                .where(eq(paragraphsTable.id, extra.children.id)),
            );
          }
          return ops;
        }),
      );

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

// ─────────────────────────────────────────────────────────────────────────────
// Refactored data model (paragraphs_new)
//
// The helpers below mirror replaceRollData / getExistingDataPreviewForRollId
// against the new tables (work / document / section / paragraphs_new). Imports
// go here so no more data accumulates in the legacy tables; the legacy helpers
// above stay for debugging until the migration completes.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upsert imported rows into a section of the new data model, matching by order
 * position — same interaction as replaceRollData:
 *   - Existing origin paragraph at position N → UPDATE content (and its target)
 *   - No existing paragraph at position N → INSERT origin (and target)
 *   - Extra existing paragraphs beyond imported count → "park" by negating order
 *
 * Origin/target pairing uses passage_key instead of parent_id: the target row
 * lives in the target document's counterpart section (matched by order) and
 * carries the same passage_key as its origin. Keys for new rows are generated
 * as `<work prefix>.<section order>.<row number>`.
 *
 * The counterpart section is NEVER created implicitly — it must already exist
 * and be named (via Data Management) or the import is rejected. This keeps
 * section ids stable and avoids silently splitting a document's paragraphs
 * across duplicate sections.
 *
 * References are NOT imported — they still belong to the legacy tables and are
 * reported as skipped until they move over in a later migration step.
 */
export async function replaceSectionData(
  rows: ExcelTranslationRow[],
  options: ImportOptionsNew,
): Promise<ImportResult> {
  const { originDocumentId, originSectionId, targetDocumentId, userId } = options;

  try {
    const [originDocument, originSection] = await Promise.all([
      getDocument(originDocumentId),
      getSection(originSectionId),
    ]);
    if (!originDocument || !originSection) {
      return { success: false, message: 'Origin document or section not found.' };
    }

    const passageKeyPrefix = originDocument.work?.passageKeyPrefix ?? originDocument.workId;

    const targetSection = await findTargetSection({
      sourceSection: { order: originSection.order },
      targetDocumentId,
    });
    if (!targetSection) {
      return {
        success: false,
        message:
          'The translation section for this section has not been created yet. ' +
          'Create and name it in Data Management → Translation Projects (edit the section and set a translation title) before importing.',
      };
    }
    if (!targetSection.title?.trim()) {
      return {
        success: false,
        message:
          'The translation section exists but has no title. ' +
          'Name it in Data Management → Translation Projects (edit the section and set a translation title) before importing.',
      };
    }

    const { counts, algoliaUpdates, algoliaInserts } = await db.transaction(async (tx) => {
      // ── 1. Load existing rows (non-parked) for both sides ────────────────
      const existingOrigins = await tx.query.paragraphsTableNew.findMany({
        where: (p, { eq, and, gte }) => and(eq(p.sectionId, originSectionId), gte(p.order, 0)),
        orderBy: (p, { asc }) => [asc(p.order)],
      });
      const existingTargets = await tx.query.paragraphsTableNew.findMany({
        where: (p, { eq, and, gte }) => and(eq(p.sectionId, targetSection.id), gte(p.order, 0)),
        orderBy: (p, { asc }) => [asc(p.order)],
      });
      const targetsByPassageKey = new Map(
        existingTargets.filter((t) => t.passageKey).map((t) => [t.passageKey as string, t]),
      );

      let updatedCount = 0;
      let insertedCount = 0;

      // Collected during the loop; executed in bulk after.
      const updateOps: { id: string; data: Partial<CreateParagraphNew> }[] = [];
      const insertRows: CreateParagraphNew[] = [];
      const algoliaUpdates: { searchId: string; data: object }[] = [];
      const algoliaInserts: CreateParagraphNew[] = [];

      // ── 2. Classify rows into update vs insert buckets ───────────────────
      for (let idx = 0; idx < rows.length; idx++) {
        const row = rows[idx];
        const existing = existingOrigins[idx];
        const paraOrder = idx + 1;
        // Keep an existing origin's key so its target stays attached; only new
        // rows get a generated key.
        const passageKey = existing?.passageKey ?? `${passageKeyPrefix}.${originSection.order}.${paraOrder}`;

        if (existing) {
          const originData = { content: row.origin, order: paraOrder, passageKey, updatedBy: userId };
          updateOps.push({ id: existing.id, data: originData });
          if (existing.searchId) {
            algoliaUpdates.push({ searchId: existing.searchId, data: originData });
          }
          updatedCount++;
        } else {
          const newOrigin: CreateParagraphNew = {
            id: uuidv4(),
            documentId: originDocumentId,
            sectionId: originSectionId,
            order: paraOrder,
            passageKey,
            content: row.origin,
            searchId: uuidv4(),
            createdBy: userId,
            updatedBy: userId,
          };
          insertRows.push(newOrigin);
          algoliaInserts.push(newOrigin);
          insertedCount++;
        }

        if (row.target) {
          const existingTarget = targetsByPassageKey.get(passageKey);
          if (existingTarget) {
            const targetData = { content: row.target, order: paraOrder, updatedBy: userId };
            updateOps.push({ id: existingTarget.id, data: targetData });
            if (existingTarget.searchId) {
              algoliaUpdates.push({ searchId: existingTarget.searchId, data: targetData });
            }
          } else {
            const newTarget: CreateParagraphNew = {
              id: uuidv4(),
              documentId: targetDocumentId,
              sectionId: targetSection.id,
              order: paraOrder,
              passageKey,
              content: row.target,
              searchId: uuidv4(),
              createdBy: userId,
              updatedBy: userId,
            };
            insertRows.push(newTarget);
            algoliaInserts.push(newTarget);
          }
        }
      }

      // ── 2b. Bulk operations for all collected rows ───────────────────────
      await Promise.all(
        updateOps.map((op) => tx.update(paragraphsTableNew).set(op.data).where(eq(paragraphsTableNew.id, op.id))),
      );
      if (insertRows.length > 0) {
        await tx.insert(paragraphsTableNew).values(insertRows);
      }

      // ── 3. Park extra existing paragraphs (negate order) ─────────────────
      const extras = existingOrigins.slice(rows.length);
      const parkOps: { id: string; order: number }[] = [];
      for (const extra of extras) {
        parkOps.push({ id: extra.id, order: extra.order > 0 ? -extra.order : extra.order });
        const extraTarget = extra.passageKey ? targetsByPassageKey.get(extra.passageKey) : undefined;
        if (extraTarget) {
          parkOps.push({ id: extraTarget.id, order: extraTarget.order > 0 ? -extraTarget.order : extraTarget.order });
        }
      }
      await Promise.all(
        parkOps.map((op) =>
          tx
            .update(paragraphsTableNew)
            .set({ order: op.order, updatedBy: userId })
            .where(eq(paragraphsTableNew.id, op.id)),
        ),
      );

      return { counts: { updatedCount, insertedCount, parkedCount: extras.length }, algoliaUpdates, algoliaInserts };
    });

    // ── 4. Sync to Algolia after the transaction commits ─────────────────
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

    // References still live on the legacy tables — surface what was skipped.
    const skippedReferences = rows.reduce((n, r) => n + r.references.filter((x) => x.sutraName && x.content).length, 0);

    return {
      success: true,
      inserted: counts.insertedCount,
      deleted: counts.parkedCount,
      message:
        `Updated ${counts.updatedCount} paragraph(s), inserted ${counts.insertedCount} new, parked ${counts.parkedCount} extra.` +
        (skippedReferences > 0
          ? ` ${skippedReferences} reference cell(s) were skipped — references are not yet part of the new data model.`
          : ''),
      ...(searchErrors.length > 0 && { errors: searchErrors }),
    };
  } catch (error) {
    console.error('replaceSectionData error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `Failed to replace data: ${errorMessage}`,
      errors: [errorMessage],
    };
  }
}

/**
 * Preview of the existing paragraphs_new data for a section — what the import
 * page shows before the user confirms a replace. Targets are paired from the
 * project's target document via passage_key; references are always empty here
 * (still legacy-only).
 */
export async function getExistingDataPreviewForSection(
  sectionId: string,
  targetDocumentId?: string | null,
): Promise<ExistingDataPreview> {
  const paragraphs = await readParagraphsBySectionId({
    sectionId,
    targetDocumentId: targetDocumentId ?? undefined,
  });

  return {
    paragraphs: paragraphs.slice(0, PREVIEW_LIMIT).map((p) => ({
      id: p.id,
      order: String(p.order),
      origin: p.origin,
      targetId: p.targetId,
      target: p.target,
      references: [],
    })),
    totalParagraphs: paragraphs.length,
    totalReferences: 0,
  };
}
