import type { ReadGlossary, CreateGlossary } from '~/drizzle/tables';
import type { BulkGlossaryUploadData } from '~/validations/glossary-upload.validation';

// Type for individual upload result item from validation schema
type UploadResultItem = BulkGlossaryUploadData['uploadResults'][0];

/**
 * Transform flat upload data to proper glossary structure for frontend display
 * Groups items by ID and creates proper translations array
 */
export const transformUploadDataToGlossariesForFrontend = (
  uploadData: UploadResultItem[],
  userId: string,
): ReadGlossary[] => {
  // Group upload data by ID (UUID)
  const groupedByID = uploadData.reduce(
    (acc, item) => {
      if (!acc[item.id]) {
        acc[item.id] = [];
      }
      acc[item.id].push(item);
      return acc;
    },
    {} as Record<string, UploadResultItem[]>,
  );

  // Transform each group into a single glossary with multiple translations
  return Object.entries(groupedByID)
    .map(([, items]) => {
      return transformGroupedItemsToGlossaryForFrontend(items, userId);
    })
    .filter((glossary): glossary is ReadGlossary => glossary !== null);
};

/**
 * Transform grouped items (same ID) into a single glossary object for frontend display
 */
const transformGroupedItemsToGlossaryForFrontend = (items: UploadResultItem[], userId: string): ReadGlossary | null => {
  if (items.length === 0) {
    return null;
  }

  // Use the first item as the base for common fields
  const baseItem = items[0];
  const translations = [];

  // Collect all unique translations from all items with the same ID
  for (const item of items) {
    if (item.english) {
      translations.push({
        glossary: item.english,
        language: 'english' as const,
        sutraName: item.sutraName || '',
        volume: item.volume || '',
        originSutraText: item.originSutraText || null,
        targetSutraText: item.targetSutraText || null,
        author: item.author || null,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
        phonetic: null,
        partOfSpeech: null,
      });
    }
  }

  return {
    id: baseItem.id,
    glossary: baseItem.glossary,
    phonetic: baseItem.phonetic || null,
    author: baseItem.author || null,
    cbetaFrequency: baseItem.cbetaFrequency || null,
    discussion: baseItem.discussion || null,
    subscribers: 0,
    translations: translations.length > 0 ? translations : [],
    searchId: null,
    createdBy: userId,
    updatedBy: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
};

/**
 * Transform ReadGlossary to CreateGlossary format for backend processing
 * This is the new optimized approach that sends already-transformed data
 */
// Helper function to safely convert to Date object
const safeToDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? new Date() : date;
  }
  return new Date();
};

export const transformGlossariesToCreateFormat = (
  glossaries: ReadGlossary[],
): Omit<CreateGlossary, 'searchId' | 'createdAt' | 'updatedAt'>[] => {
  return glossaries.map((glossary) => ({
    id: glossary.id,
    glossary: glossary.glossary,
    phonetic: glossary.phonetic,
    author: glossary.author,
    cbetaFrequency: glossary.cbetaFrequency,
    discussion: glossary.discussion,
    subscribers: glossary.subscribers || 0,
    translations: glossary.translations || [],
    createdBy: glossary.createdBy,
    updatedBy: glossary.updatedBy,
    deletedAt: safeToDate(glossary.deletedAt),
  }));
};
