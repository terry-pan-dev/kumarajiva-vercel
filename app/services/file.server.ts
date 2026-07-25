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

import type { CreateParagraphNew, ReadParagraphNew } from '~/drizzle/schema';

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
import { DbProjectReferences, DbProjects } from './project.crud';
import { saveParagraphsToAlgolia, updateParagraphsToAlgolia } from './search.server';
import { DbParagraphsNew } from './text.crud';
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

// Thrown when the file's passage keys / row order can't be reconciled with what
// is already in the database. Carries a user-facing message returned verbatim
// rather than wrapped as a generic failure.
class ImportConflictError extends Error {}

const normaliseKey = (key: string): string => key.trim().toLowerCase();

// One document involved in an import: where its column data goes and how to read
// that column from a row. `sectionId` is null when the document's counterpart
// section doesn't exist yet. `write` is true when the file actually carries
// content for this document (a document with no column, or an all-empty column,
// is left untouched).
type InvolvedDocument = {
  label: string;
  documentId: string;
  sectionId: string | null;
  getValue: (row: ExcelTranslationRow) => string | null;
  write: boolean;
};

/**
 * Import a spreadsheet into the new data model, where every column is a document
 * (origin, translation, and reference documents are all documents now). Columns
 * are identified by each document's `key`; a `passage_key` column (optional)
 * gives every document's paragraph on that row the same passage key.
 *
 * The file may carry ANY subset of the documents — one column or all of them —
 * so a new reference can be added later as a single column and aligned to the
 * data already present. Only documents whose column has content are written;
 * documents absent from the file (or all-empty) are left untouched.
 *
 * Rows are aligned across documents by passage key and/or position, which must
 * be consistent with existing data. Each row's passage key is decided once, used
 * by every document on that row:
 *   - the `passage_key` cell, when present;
 *   - otherwise the key already stored at that position (origin, translation or
 *     a reference — they must agree);
 *   - otherwise a generated `<work prefix>.<section order>.<row number>`.
 * If the file's key/position disagrees with existing data (a position already
 * keyed to something else, or documents keyed inconsistently at a position) the
 * import is rejected with guidance so the admin can reconcile the database.
 *
 * Per document, a paragraph is matched by passage key, else by an unkeyed row at
 * the same position; matched rows are updated, unmatched inserted, and existing
 * paragraphs of a WRITTEN document that the file didn't touch are parked. Each
 * document's counterpart section (matched to the origin section by order) must
 * already exist and be named — reference columns whose section is missing/unnamed
 * (or whose key isn't a project reference) are skipped and reported.
 */
export async function replaceSectionData(
  rows: ExcelTranslationRow[],
  options: ImportOptionsNew,
): Promise<ImportResult> {
  const { originDocumentId, originSectionId, targetDocumentId, userId } = options;

  try {
    const [originDocument, originSection, targetDocument] = await Promise.all([
      getDocument(originDocumentId),
      getSection(originSectionId),
      getDocument(targetDocumentId),
    ]);
    if (!originDocument || !originSection) {
      return { success: false, message: 'Origin document or section not found.' };
    }

    const passageKeyPrefix = originDocument.work?.passageKeyPrefix ?? originDocument.workId;
    const sectionOrder = originSection.order;

    const has = (getValue: (row: ExcelTranslationRow) => string | null) => rows.some((r) => getValue(r)?.trim());

    // ── Assemble the documents involved in this import ───────────────────────
    const involved: InvolvedDocument[] = [];
    const skippedColumns: string[] = [];

    // Origin.
    involved.push({
      label: 'origin',
      documentId: originDocumentId,
      sectionId: originSectionId,
      getValue: (row) => row.origin || null,
      write: has((r) => r.origin || null),
    });

    // Translation — its section must exist and be named when the file carries
    // translation content; otherwise it's simply not written.
    const targetSection = targetDocument
      ? await findTargetSection({ sourceSection: { order: sectionOrder }, targetDocumentId })
      : null;
    const wantsTarget = has((r) => r.target);
    if (wantsTarget && (!targetSection || !targetSection.title?.trim())) {
      return {
        success: false,
        message:
          'The translation section for this section has not been created and named yet. ' +
          'Create and name it in Data Management → Translation Projects (edit the section and set a translation title) before importing translation data.',
      };
    }
    involved.push({
      label: 'translation',
      documentId: targetDocumentId,
      sectionId: targetSection?.id ?? null,
      getValue: (row) => row.target,
      write: wantsTarget && !!targetSection,
    });

    // Reference documents — every non-origin/translation column, headed by a
    // reference document's key. Resolve each to the project's reference document
    // and its counterpart section; unresolved columns are reported, not imported.
    const fileReferenceKeys = [
      ...new Set(rows.flatMap((r) => r.references.map((ref) => ref.sutraName).filter((k): k is string => !!k))),
    ];
    const project = await DbProjects.findBySourceDocumentId(originDocumentId);
    const projectReferences = project ? await DbProjectReferences.findByProjectId(project.id) : [];
    const referenceByKey = new Map(
      projectReferences
        .filter((ref) => ref.document?.key)
        .map((ref) => [normaliseKey(ref.document.key as string), ref] as const),
    );

    for (const columnKey of fileReferenceKeys) {
      const ref = referenceByKey.get(normaliseKey(columnKey));
      if (!ref) {
        skippedColumns.push(`"${columnKey}" (not a reference document on this project)`);
        continue;
      }
      const refSection = await findTargetSection({
        sourceSection: { order: sectionOrder },
        targetDocumentId: ref.documentId,
      });
      if (!refSection || !refSection.title?.trim()) {
        skippedColumns.push(`"${columnKey}" (its section is missing or unnamed — create and name it first)`);
        continue;
      }
      involved.push({
        label: columnKey,
        documentId: ref.documentId,
        sectionId: refSection.id,
        getValue: (row) => row.references.find((r) => r.sutraName === columnKey)?.content ?? null,
        write: true,
      });
    }

    const writeDocs = involved.filter((d) => d.write && d.sectionId);
    if (writeDocs.length === 0) {
      return {
        success: false,
        message:
          skippedColumns.length > 0
            ? `Nothing was imported. Skipped column(s): ${skippedColumns.join('; ')}.`
            : 'No importable content found. The file has no columns matching a document key (origin, translation or a reference key).',
      };
    }

    // Sections to load for alignment: every involved document that has a section,
    // whether or not it is being written (existing data anchors the row keys).
    const anchorSectionIds = [...new Set(involved.map((d) => d.sectionId).filter((s): s is string => !!s))];

    const { counts, algoliaUpdates, algoliaInserts } = await db.transaction(async (tx) => {
      const existingBySection = new Map<string, ReadParagraphNew[]>();
      for (const sid of anchorSectionIds) {
        existingBySection.set(
          sid,
          await tx.query.paragraphsTableNew.findMany({
            where: (p, { eq, and, gte }) => and(eq(p.sectionId, sid), gte(p.order, 0)),
            orderBy: (p, { asc }) => [asc(p.order)],
          }),
        );
      }

      const paraAtOrder = (sectionId: string, order: number) =>
        (existingBySection.get(sectionId) ?? []).find((p) => p.order === order);
      const paraWithKey = (sectionId: string, key: string) =>
        (existingBySection.get(sectionId) ?? []).find((p) => p.passageKey === key);

      // ── 1. Decide each row's shared passage key and canonical order ─────────
      const rowKeys: string[] = [];
      const rowOrders: number[] = [];
      for (let idx = 0; idx < rows.length; idx++) {
        const fileKey = rows[idx].passageKey?.trim() || null;
        const positionOrder = idx + 1;

        if (fileKey) {
          // Match by key when any anchor already stores it, inheriting its order.
          const keyed = anchorSectionIds.map((sid) => paraWithKey(sid, fileKey)).find(Boolean);
          if (keyed) {
            rowKeys.push(fileKey);
            rowOrders.push(keyed.order);
            continue;
          }
          // A brand-new key can't land on a position already keyed to something else.
          const clash = anchorSectionIds
            .map((sid) => paraAtOrder(sid, positionOrder))
            .find((p) => p?.passageKey && p.passageKey !== fileKey);
          if (clash) {
            throw new ImportConflictError(
              `Row ${idx + 1}: passage_key "${fileKey}" is new, but position ${positionOrder} already holds a ` +
                `paragraph keyed "${clash.passageKey}". Reconcile the passage keys / row order in the database ` +
                `(via Data Management / the inspector) so the file agrees with existing data, then re-import.`,
            );
          }
          rowKeys.push(fileKey);
          rowOrders.push(positionOrder);
          continue;
        }

        // No passage_key column — align by position, using the key already stored
        // at that position. All documents that carry one must agree.
        const keysAtOrder = new Set(
          anchorSectionIds.map((sid) => paraAtOrder(sid, positionOrder)?.passageKey).filter((k): k is string => !!k),
        );
        if (keysAtOrder.size > 1) {
          throw new ImportConflictError(
            `Row ${idx + 1} (position ${positionOrder}): existing documents disagree on the passage key here ` +
              `(${[...keysAtOrder].join(', ')}). Reconcile them in the database so each position has one key, then re-import.`,
          );
        }
        rowKeys.push([...keysAtOrder][0] ?? `${passageKeyPrefix}.${sectionOrder}.${positionOrder}`);
        rowOrders.push(positionOrder);
      }

      // ── 2. Reconcile one document's section against the rows ──────────────
      // Pure upsert: rows present in the file are updated (matched by passage key,
      // else by an unkeyed row at the same position) or inserted. Existing
      // paragraphs the file doesn't mention are left untouched — nothing is
      // removed — so a file can carry only the rows that need changing.
      const reconcile = (doc: InvolvedDocument, existing: ReadParagraphNew[]) => {
        const byKey = new Map(existing.filter((p) => p.passageKey).map((p) => [p.passageKey as string, p]));
        const byOrder = new Map(existing.map((p) => [p.order, p]));
        const updates: { id: string; data: Partial<CreateParagraphNew> }[] = [];
        const inserts: CreateParagraphNew[] = [];
        const aUpdates: { searchId: string; data: object }[] = [];
        const aInserts: CreateParagraphNew[] = [];

        for (let idx = 0; idx < rows.length; idx++) {
          const key = rowKeys[idx];
          const order = rowOrders[idx];
          const value = doc.getValue(rows[idx]);

          // No content for this document on this row — nothing to upsert.
          if (value == null || value.trim() === '') continue;

          let match = byKey.get(key);
          if (!match) {
            const pos = byOrder.get(order);
            // Only reuse the positional row when it is unkeyed; a keyed row
            // belongs to a different passage and must not be overwritten.
            if (pos && !pos.passageKey) match = pos;
          }

          if (match) {
            const data: Partial<CreateParagraphNew> = { content: value, order, passageKey: key, updatedBy: userId };
            updates.push({ id: match.id, data });
            if (match.searchId) aUpdates.push({ searchId: match.searchId, data });
          } else {
            const newRow: CreateParagraphNew = {
              id: uuidv4(),
              documentId: doc.documentId,
              sectionId: doc.sectionId as string,
              order,
              passageKey: key,
              content: value,
              searchId: uuidv4(),
              createdBy: userId,
              updatedBy: userId,
            };
            inserts.push(newRow);
            aInserts.push(newRow);
          }
        }

        return { updates, inserts, aUpdates, aInserts };
      };

      const results = writeDocs.map((doc) => reconcile(doc, existingBySection.get(doc.sectionId as string) ?? []));

      const updateOps = results.flatMap((r) => r.updates);
      const insertRows = results.flatMap((r) => r.inserts);
      const algoliaUpdates = results.flatMap((r) => r.aUpdates);
      const algoliaInserts = results.flatMap((r) => r.aInserts);

      // ── 3. Bulk-execute all collected operations ──────────────────────────
      await Promise.all(
        updateOps.map((op) => tx.update(paragraphsTableNew).set(op.data).where(eq(paragraphsTableNew.id, op.id))),
      );
      if (insertRows.length > 0) {
        await tx.insert(paragraphsTableNew).values(insertRows);
      }

      return {
        counts: { updatedCount: updateOps.length, insertedCount: insertRows.length },
        algoliaUpdates,
        algoliaInserts,
      };
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

    const writtenLabels = writeDocs.map((d) => d.label).join(', ');
    return {
      success: true,
      inserted: counts.insertedCount,
      message:
        `Updated ${counts.updatedCount} paragraph(s) and inserted ${counts.insertedCount} new across ${writeDocs.length} document(s) (${writtenLabels}). Existing rows not in the file were left unchanged.` +
        (skippedColumns.length > 0 ? ` Skipped column(s): ${skippedColumns.join('; ')}.` : ''),
      ...(searchErrors.length > 0 && { errors: searchErrors }),
    };
  } catch (error) {
    if (error instanceof ImportConflictError) {
      return { success: false, message: error.message, errors: [error.message] };
    }
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
 * page shows before the user confirms an import. The translation is paired from
 * the project's target document via passage_key; each reference document's
 * paragraph sharing the same passage_key is shown as a reference column (labelled
 * by the reference document's key).
 */
export async function getExistingDataPreviewForSection(
  sectionId: string,
  targetDocumentId?: string | null,
  referenceDocuments: { id: string; key: string | null }[] = [],
): Promise<ExistingDataPreview> {
  const paragraphs = await readParagraphsBySectionId({
    sectionId,
    targetDocumentId: targetDocumentId ?? undefined,
  });

  const preview = paragraphs.slice(0, PREVIEW_LIMIT);
  const passageKeys = preview.map((p) => p.passageKey).filter((k): k is string => !!k);

  // For each keyed reference document, map passage_key → its paragraph so we can
  // attach reference content to the matching preview row.
  const keyedReferences = referenceDocuments.filter((ref) => ref.key);
  const referenceParagraphs = await Promise.all(
    keyedReferences.map(async (ref) => {
      const paras = passageKeys.length ? await DbParagraphsNew.findByDocumentIdAndPassageKeys(ref.id, passageKeys) : [];
      const byPassageKey = new Map(paras.filter((p) => p.passageKey).map((p) => [p.passageKey as string, p]));
      return { key: ref.key as string, byPassageKey };
    }),
  );

  let totalReferences = 0;
  const previewParagraphs = preview.map((p) => {
    const references = p.passageKey
      ? referenceParagraphs
          .map(({ key, byPassageKey }) => {
            const refPara = byPassageKey.get(p.passageKey as string);
            return refPara
              ? { id: refPara.id, order: String(refPara.order), sutraName: key, content: refPara.content }
              : null;
          })
          .filter((r): r is NonNullable<typeof r> => r !== null)
      : [];
    totalReferences += references.length;
    return {
      id: p.id,
      order: String(p.order),
      origin: p.origin,
      targetId: p.targetId,
      target: p.target,
      references,
    };
  });

  return {
    paragraphs: previewParagraphs,
    totalParagraphs: paragraphs.length,
    totalReferences,
  };
}
