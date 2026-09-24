// Reading the JSON `metadata` columns (works, documents, projects). Each holds a
// single object whose top-level keys each belong to one feature — a "section",
// e.g. projects.metadata.workingDocument — so features grow without new
// columns and without stepping on each other. Values are checked with a zod
// schema on the way out: anything missing or malformed reads as undefined
// rather than breaking the page. Writing lives in lib/metadata.server.ts.
import type { ZodType } from 'zod';

export type Metadata = Record<string, unknown> | null | undefined;

// One feature's section of the metadata, or {} when absent or not an object.
export const metadataSection = (metadata: Metadata, section: string): Record<string, unknown> => {
  const value = metadata?.[section];
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
};

// One field of a section, validated; undefined when missing or invalid.
export const metadataField = <T>(metadata: Metadata, section: string, field: string, schema: ZodType<T>) => {
  const parsed = schema.safeParse(metadataSection(metadata, section)[field]);
  return parsed.success ? parsed.data : undefined;
};
