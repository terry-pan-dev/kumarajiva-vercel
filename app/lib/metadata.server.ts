// Writing the JSON `metadata` columns (see utils/metadata.ts for the layout).
import { eq, sql } from 'drizzle-orm';

import type { documentsTable, projectsTable, worksTable } from '~/drizzle/schema';

import { getDb } from './db.server';

type TableWithMetadata = typeof projectsTable | typeof worksTable | typeof documentsTable;

// Shallow-merges `fields` into one section of a row's metadata, in a single
// statement so concurrent writers to other fields or sections are not lost.
// Metadata is settings and bookkeeping, not the row's data, so the audit
// columns are left as they were: updated_at is set to itself, which also stops
// its $onUpdate hook from bumping it.
export const mergeMetadataSection = async (
  table: TableWithMetadata,
  id: string,
  section: string,
  fields: Record<string, unknown>,
) => {
  const current = sql`coalesce(${table.metadata}::jsonb, '{}'::jsonb)`;
  // A section that is missing or not an object starts empty, as it reads.
  const currentSection = sql`case when jsonb_typeof(${current} -> ${section}::text) = 'object'
    then ${current} -> ${section}::text else '{}'::jsonb end`;
  return getDb()
    .update(table)
    .set({
      metadata: sql`(${current} || jsonb_build_object(
        ${section}::text, ${currentSection} || ${JSON.stringify(fields)}::jsonb
      ))::json`,
      updatedAt: sql`${table.updatedAt}`,
    })
    .where(eq(table.id, id));
};
