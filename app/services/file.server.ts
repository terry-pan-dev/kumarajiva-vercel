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
import { translator, type AppTFunction } from '~/i18n/config';
import { LocalizedError, localizeError, translateKey } from '~/i18n/errors';
import { getDb } from '~/lib/db.server';
import { PREVIEW_LIMIT } from '~/utils/constants';

import type { SectionContext } from './project.service';

import {
  mergeParagraphMetadata,
  type ExcelTranslationRow,
  type ExistingDataPreview,
  type ImportOptions,
  type ImportResult,
  type ParagraphMetadataCell,
} from './file.service';
import { type IndexableParagraph } from './paragraph.record';
import { readParagraphsByRollIdForLanguage } from './paragraph.service';
import { indexParagraphs, maxRecordBytes } from './search.server';
import { readParagraphsBySectionId, type ReferenceDocument } from './text.service';

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
 * Legacy tables are not written to the search index, which holds paragraphs_new
 * rows only.
 * Parked paragraphs (and their children) are excluded from all reads via the
 * `number >= 0` filter applied in crud.server.ts.
 */
export async function replaceRollData(rows: ExcelTranslationRow[], options: ImportOptions): Promise<ImportResult> {
  const { originRollId, targetRollId, originalLanguage, translationLanguage, userId } = options;
  const { originParagraphs, targetParagraphs, referencesToInsert } = buildImportData(rows, options);

  try {
    const counts = await db.transaction(async (tx) => {
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

          const builtTarget = targetParagraphs.find((t) => t.parentId === originParagraphs[idx].id);
          if (builtTarget) {
            const newTarget = { ...builtTarget, searchId: uuidv4() };
            newTargetRows.push(newTarget);
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
// A file that disagrees with existing data. Its message is shown to the admin
// in their language, so it carries a translation key rather than prose.
class ImportConflictError extends LocalizedError {}

const normaliseKey = (key: string): string => key.trim().toLowerCase();

// One document involved in an import: where its column data goes and how to read
// that column from a row. `sectionId` is null when the document's counterpart
// section doesn't exist yet. `write` is true when the file actually carries
// content or metadata columns for this document (a document with neither, or
// only an all-empty content column, is left untouched).
type InvolvedDocument = {
  label: string;
  documentId: string;
  sectionId: string | null;
  getValue: (row: ExcelTranslationRow) => string | null;
  getMetadata: (row: ExcelTranslationRow) => ParagraphMetadataCell[];
  write: boolean;
};

// A row's metadata cells for one document (none when it has no key).
const metadataCellsFor =
  (documentKey: string | null | undefined) =>
  (row: ExcelTranslationRow): ParagraphMetadataCell[] =>
    documentKey ? (row.metadata ?? []).filter((m) => normaliseKey(m.documentKey) === normaliseKey(documentKey)) : [];

// The file row behind one search record written by an import. `row` is numbered as in the
// import's other row errors (the first data row is 1).
type IndexedSource = { searchId: string | null; row: number; key: string; document: string };

// The file row a search record (addressed by its objectID, the row's search_id) came from; null
// for one this import didn't send.
function sourceOf(objectID: string | undefined, sources: IndexedSource[]): Omit<IndexedSource, 'searchId'> | null {
  const source = objectID ? sources.find((s) => s.searchId === objectID) : undefined;
  if (!source) return null;
  const { searchId: _searchId, ...location } = source;
  return location;
}

// Algolia names the offending record in some errors ("… objectID=<id> is too big …"). Maps that
// id back to the file row it came from; null when the message names none, or one we didn't send.
export function findIndexedSource(message: string, sources: IndexedSource[]): Omit<IndexedSource, 'searchId'> | null {
  return sourceOf(/objectID=([^\s,;]+)/.exec(message)?.[1], sources);
}

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
  context: SectionContext,
  userId: string,
  // Renders the result messages; the import route passes the request's locale.
  t: AppTFunction = translator('en'),
): Promise<ImportResult> {
  const { origin, target, passageKeyPrefix } = context;
  const sectionOrder = origin.section.order;
  const r = (key: string, values?: Record<string, unknown>) =>
    translateKey(t, `data:projects.import.result.${key}`, values);
  const joinColumns = (columns: string[]) => columns.join(t('separators.semicolon'));

  try {
    const has = (getValue: (row: ExcelTranslationRow) => string | null) => rows.some((r) => getValue(r)?.trim());
    // Whether the file has any `<key>.<field>` column for a document — even an
    // all-empty one, since empty metadata cells clear their field.
    const hasMetadataColumns = (documentKey: string | null | undefined) =>
      rows.some((row) => metadataCellsFor(documentKey)(row).length > 0);

    // ── Assemble the documents involved in this import ───────────────────────
    const involved: InvolvedDocument[] = [];
    const skippedColumns: string[] = [];

    // Origin.
    involved.push({
      label: r('originLabel'),
      documentId: origin.document.id,
      sectionId: origin.section.id,
      getValue: (row) => row.origin || null,
      getMetadata: metadataCellsFor(origin.document.key),
      write: has((r) => r.origin || null) || hasMetadataColumns(origin.document.key),
    });

    // Translation — its section must exist and be named when the file carries
    // translation content; otherwise it's simply not written.
    const targetSection = target.section;
    const wantsTarget = has((r) => r.target);
    const targetSectionNamed = !!targetSection?.title?.trim();
    if (wantsTarget && !targetSectionNamed) {
      return { success: false, message: r('translationSectionMissing') };
    }
    // Translation metadata alone doesn't fail the import — its columns are
    // skipped like a reference whose section isn't set up.
    const wantsTargetMetadata = hasMetadataColumns(target.document.key);
    if (wantsTargetMetadata && !targetSectionNamed) {
      skippedColumns.push(r('skippedNoSection', { column: target.document.key }));
    }
    involved.push({
      label: r('translationLabel'),
      documentId: target.document.id,
      sectionId: targetSection?.id ?? null,
      getValue: (row) => row.target,
      getMetadata: metadataCellsFor(target.document.key),
      write: (wantsTarget || wantsTargetMetadata) && targetSectionNamed,
    });

    // Reference documents — every non-origin/translation column, headed by a
    // reference document's key, plus any reference that only has metadata
    // columns. Resolve each to the project's reference document and its
    // counterpart section; unresolved columns are reported, not imported.
    const mainKeys = new Set(
      [origin.document.key, target.document.key].filter((k): k is string => !!k).map(normaliseKey),
    );
    const fileReferenceKeys = [
      ...new Map(
        rows
          .flatMap((r) => [
            ...r.references.map((ref) => ref.sutraName),
            ...(r.metadata ?? []).map((m) => m.documentKey),
          ])
          .filter((k): k is string => !!k && !mainKeys.has(normaliseKey(k)))
          .map((k) => [normaliseKey(k), k] as const),
      ).values(),
    ];
    const referenceByKey = new Map(
      context.references
        .filter((ref) => ref.document.key)
        .map((ref) => [normaliseKey(ref.document.key as string), ref] as const),
    );

    for (const columnKey of fileReferenceKeys) {
      const ref = referenceByKey.get(normaliseKey(columnKey));
      if (!ref) {
        skippedColumns.push(r('skippedNotReference', { column: columnKey }));
        continue;
      }
      const refSection = ref.section;
      if (!refSection || !refSection.title?.trim()) {
        skippedColumns.push(r('skippedNoSection', { column: columnKey }));
        continue;
      }
      involved.push({
        label: columnKey,
        documentId: ref.document.id,
        sectionId: refSection.id,
        getValue: (row) =>
          row.references.find((r) => r.sutraName && normaliseKey(r.sutraName) === normaliseKey(columnKey))?.content ??
          null,
        getMetadata: metadataCellsFor(columnKey),
        write: true,
      });
    }

    const writeDocs = involved.filter((d) => d.write && d.sectionId);
    if (writeDocs.length === 0) {
      return {
        success: false,
        message:
          skippedColumns.length > 0
            ? r('nothingImported', { columns: joinColumns(skippedColumns) })
            : r('noImportableContent'),
      };
    }

    // Sections to load for alignment: every involved document that has a section,
    // whether or not it is being written (existing data anchors the row keys).
    const anchorSectionIds = [...new Set(involved.map((d) => d.sectionId).filter((s): s is string => !!s))];

    const { counts, toIndex, indexedFrom, metadataSkipped } = await db.transaction(async (tx) => {
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
            throw new ImportConflictError('data:projects.import.result.conflictNewKey', {
              row: idx + 1,
              key: fileKey,
              position: positionOrder,
              existingKey: clash.passageKey,
            });
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
          throw new ImportConflictError('data:projects.import.result.conflictDisagree', {
            row: idx + 1,
            position: positionOrder,
            keys: [...keysAtOrder].join(', '),
          });
        }
        rowKeys.push([...keysAtOrder][0] ?? `${passageKeyPrefix}.${sectionOrder}.${positionOrder}`);
        rowOrders.push(positionOrder);
      }

      // ── 2. Reconcile one document's section against the rows ──────────────
      // Pure upsert: rows present in the file are updated (matched by passage key,
      // else by an unkeyed row at the same position) or inserted. Existing
      // paragraphs the file doesn't mention are left untouched — nothing is
      // removed — so a file can carry only the rows that need changing.
      // Metadata cells are merged into the matched paragraph's metadata; a row
      // with metadata but no content updates an existing paragraph only, since
      // metadata can't create one (those rows are counted and reported).
      const reconcile = (doc: InvolvedDocument, existing: ReadParagraphNew[]) => {
        const byKey = new Map(existing.filter((p) => p.passageKey).map((p) => [p.passageKey as string, p]));
        const byOrder = new Map(existing.map((p) => [p.order, p]));
        const updates: { id: string; data: Partial<CreateParagraphNew> }[] = [];
        const inserts: CreateParagraphNew[] = [];
        // Search records are saved whole (see indexParagraphs), so updated rows
        // carry the stored row with the file's changes applied.
        const toIndex: IndexableParagraph[] = [];
        // Where each indexed record came from, so a search failure that names an objectID
        // (e.g. a record over Algolia's size limit) can be reported as a file row.
        const indexedFrom: IndexedSource[] = [];
        let metadataWithoutParagraph = 0;

        for (let idx = 0; idx < rows.length; idx++) {
          const key = rowKeys[idx];
          const order = rowOrders[idx];
          const value = doc.getValue(rows[idx]);
          const hasContent = value != null && value.trim() !== '';
          const metadataCells = doc.getMetadata(rows[idx]);

          // Neither content nor metadata for this document on this row.
          if (!hasContent && metadataCells.length === 0) continue;

          let match = byKey.get(key);
          if (!match) {
            const pos = byOrder.get(order);
            // Only reuse the positional row when it is unkeyed; a keyed row
            // belongs to a different passage and must not be overwritten.
            if (pos && !pos.passageKey) match = pos;
          }

          if (match) {
            // Metadata isn't indexed for search, so only content changes go to Algolia.
            const contentData: Partial<CreateParagraphNew> = hasContent
              ? { content: value, order, passageKey: key, updatedBy: userId }
              : {};
            const data: Partial<CreateParagraphNew> = {
              ...contentData,
              ...(metadataCells.length > 0 && { metadata: mergeParagraphMetadata(match.metadata, metadataCells) }),
              updatedBy: userId,
            };
            updates.push({ id: match.id, data });
            if (hasContent) {
              toIndex.push({ ...match, ...contentData });
              indexedFrom.push({ searchId: match.searchId, row: idx + 1, key, document: doc.label });
            }
          } else if (hasContent) {
            const newRow = {
              id: uuidv4(),
              documentId: doc.documentId,
              sectionId: doc.sectionId as string,
              order,
              passageKey: key,
              content: value,
              searchId: uuidv4(),
              createdBy: userId,
              updatedBy: userId,
            } satisfies CreateParagraphNew;
            const metadata = mergeParagraphMetadata(null, metadataCells);
            inserts.push(metadata ? { ...newRow, metadata } : newRow);
            toIndex.push(newRow);
            indexedFrom.push({ searchId: newRow.searchId, row: idx + 1, key, document: doc.label });
          } else if (metadataCells.some((m) => m.value)) {
            metadataWithoutParagraph++;
          }
        }

        return { updates, inserts, toIndex, indexedFrom, metadataWithoutParagraph };
      };

      const results = writeDocs.map((doc) => reconcile(doc, existingBySection.get(doc.sectionId as string) ?? []));

      const updateOps = results.flatMap((r) => r.updates);
      const insertRows = results.flatMap((r) => r.inserts);
      const toIndex = results.flatMap((r) => r.toIndex);
      const indexedFrom = results.flatMap((r) => r.indexedFrom);
      const metadataSkipped = writeDocs
        .map((doc, i) => ({ label: doc.label, count: results[i].metadataWithoutParagraph }))
        .filter((d) => d.count > 0);

      // ── 3. Bulk-execute all collected operations ──────────────────────────
      await Promise.all(
        updateOps.map((op) => tx.update(paragraphsTableNew).set(op.data).where(eq(paragraphsTableNew.id, op.id))),
      );
      if (insertRows.length > 0) {
        await tx.insert(paragraphsTableNew).values(insertRows);
      }

      return {
        counts: { updatedCount: updateOps.length, insertedCount: insertRows.length },
        toIndex,
        indexedFrom,
        metadataSkipped,
      };
    });

    // ── 4. Sync to Algolia after the transaction commits ─────────────────
    // A search failure is reported, never thrown: the committed DB data stands.
    const searchErrors: string[] = [];
    try {
      const tooBig = await indexParagraphs(toIndex);
      // Every record sent came from a file row, so each one has a source.
      for (const record of tooBig) {
        const source = sourceOf(record.searchId, indexedFrom);
        if (source) searchErrors.push(r('searchTooBig', { ...source, bytes: record.bytes, limit: maxRecordBytes() }));
      }
      if (tooBig.length) console.warn('Paragraphs too big for the search index after import:', tooBig);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const source = findIndexedSource(message, indexedFrom);
      searchErrors.push(
        source ? r('searchSyncFailedAt', { ...source, error: message }) : r('searchSyncFailed', { error: message }),
      );
      console.error('Algolia sync errors after import:', searchErrors);
    }

    const writtenLabels = writeDocs.map((d) => d.label).join(t('separators.list'));
    return {
      success: true,
      inserted: counts.insertedCount,
      message:
        r('success', { updated: counts.updatedCount, inserted: counts.insertedCount, documents: writtenLabels }) +
        (skippedColumns.length > 0 ? r('skippedSuffix', { columns: joinColumns(skippedColumns) }) : '') +
        metadataSkipped.map(({ label, count }) => r('metadataWithoutParagraph', { count, document: label })).join(''),
      ...(searchErrors.length > 0 && { errors: searchErrors }),
    };
  } catch (error) {
    if (error instanceof ImportConflictError) {
      const message = localizeError(error, t);
      return { success: false, message, errors: [message] };
    }
    console.error('replaceSectionData error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: r('failed', { error: errorMessage }),
      errors: [errorMessage],
    };
  }
}

/**
 * Preview of the existing paragraphs_new data for a section — what the import
 * page shows before the user confirms an import. The translation and each
 * reference document's text are paired by passage_key (see
 * readParagraphsBySectionId); references are shown as columns labelled by the
 * reference document's key, so only keyed references appear.
 */
export async function getExistingDataPreviewForSection(
  sectionId: string,
  targetDocumentId?: string | null,
  references: ReferenceDocument[] = [],
): Promise<ExistingDataPreview> {
  const paragraphs = await readParagraphsBySectionId({
    sectionId,
    targetDocumentId: targetDocumentId ?? undefined,
    references: references.filter((reference) => reference.document.key),
  });

  const preview = paragraphs.slice(0, PREVIEW_LIMIT);

  let totalReferences = 0;
  const previewParagraphs = preview.map((p) => {
    const paragraphReferences = p.references.flatMap((reference) =>
      reference.content === null
        ? []
        : [{ id: reference.documentId, order: String(p.order), sutraName: reference.key!, content: reference.content }],
    );
    totalReferences += paragraphReferences.length;
    return {
      id: p.id,
      order: String(p.order),
      origin: p.origin,
      targetId: p.targetId,
      target: p.target,
      references: paragraphReferences,
    };
  });

  return {
    paragraphs: previewParagraphs,
    totalParagraphs: paragraphs.length,
    totalReferences,
  };
}
