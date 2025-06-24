import { type CsvValidationResult } from '~/hooks/use-csv-uploader';

import { CsvFileUploader } from './CsvFileUploader';

// Utility function to normalize text to searchable ASCII
const normalizeToSearchable = (text: string): string => {
  return text
    .normalize('NFD') // Decompose accented characters
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritical marks
    .toLowerCase()
    .trim();
};

// Example usage with object composition similar to your glossary script
export const GlossaryUploader = () => {
  const requiredHeaders = [
    'UUID',
    'ChineseTerm',
    'Phonetic',
    'PhoneticSearchable',
    'Author',
    'CBetaFrequency',
    'EnglishTerm',
    'EnglishTermSearchable',
    'SutraName',
    'Volume',
    'ChineseSutraText',
    'EnglishSutraText',
  ] as const;

  // Function to compose CSV data into structured objects
  const composeGlossaryObjects = (data: Record<string, string>[]) => {
    const userId = 'd2e3bb43-cb01-4673-81ed-20fd4b5acfc9'; // DEV user ID
    const obj: Record<string, any> = {};

    data.forEach((row) => {
      const id = row['UUID'];
      const glossary = row['ChineseTerm'];
      const phonetic = row['Phonetic'];
      const phoneticSearchable = normalizeToSearchable(phonetic);
      const author = row['Author'];
      const cbetaFrequency = row['CBetaFrequency'];
      const englishGlossary = row['EnglishTerm'];
      const englishGlossarySearchable = normalizeToSearchable(englishGlossary);
      const sutraName = row['SutraName'];
      const volume = row['Volume'];
      const originSutraText = row['ChineseSutraText'] || null;
      const targetSutraText = row['EnglishSutraText'] || null;

      const translation = {
        glossary: englishGlossary,
        glossarySearchable: englishGlossarySearchable,
        language: 'english',
        sutraName,
        volume,
        author,
        originSutraText,
        targetSutraText,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      };

      if (obj[id]) {
        obj[id].translations.push(translation);
      } else {
        obj[id] = {
          id,
          glossary,
          phonetic,
          phoneticSearchable,
          author,
          cbetaFrequency,
          createdBy: userId,
          updatedBy: userId,
          translations: [translation],
        };
      }
    });

    return Object.values(obj);
  };

  const handleValidationComplete = (result: CsvValidationResult) => {
    if (result.isValid && result.composedObjects) {
      console.log('Composed glossary objects:', result.composedObjects);
      // Here you would typically send result.composedObjects to your backend
      // e.g., submitGlossaryData(result.composedObjects)
    }
  };

  return (
    <CsvFileUploader
      requiredHeaders={requiredHeaders}
      maxFileSizeBytes={5 * 1024 * 1024} // 5MB
      composeObjects={composeGlossaryObjects}
      onValidationComplete={handleValidationComplete}
    />
  );
};

// Example for a different data structure
export const SimpleDataUploader = () => {
  const requiredHeaders = ['name', 'email', 'role'] as const;

  const composeUserObjects = (data: Record<string, string>[]) => {
    return data.map((row, index) => ({
      id: `user_${index + 1}`,
      name: row['name']?.trim(),
      email: row['email']?.toLowerCase().trim(),
      role: row['role']?.toLowerCase(),
      createdAt: new Date().toISOString(),
      status: 'active',
    }));
  };

  const handleValidationComplete = (result: CsvValidationResult) => {
    if (result.isValid && result.composedObjects) {
      console.log('Composed user objects:', result.composedObjects);
      // Send to backend: submitUserData(result.composedObjects)
    }
  };

  return (
    <CsvFileUploader
      requiredHeaders={requiredHeaders}
      composeObjects={composeUserObjects}
      onValidationComplete={handleValidationComplete}
    />
  );
};
