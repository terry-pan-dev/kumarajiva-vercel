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

import { DEFAULT_ORIGIN_LANG, PREVIEW_LIMIT } from '~/utils/constants';

import { type ExistingDataPreview } from './file.service';
import { readParagraphsByRollIdForLanguage } from './paragraph.service';

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
