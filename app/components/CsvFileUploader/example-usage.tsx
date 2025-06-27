import { type CsvValidationResult } from '~/hooks/use-csv-uploader';

import { CsvFileUploader } from './CsvFileUploader';

// Example usage showing proper object composition for glossary CSV upload

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
  // This matches the current validation schema structure for bulk upload
  const composeGlossaryObjects = (data: Record<string, string>[]) => {
    return data.map((row) => {
      const id = row['UUID'];
      const glossary = row['ChineseTerm'];
      const phonetic = row['Phonetic'] || undefined;
      const author = row['Author'] || undefined;
      const cbetaFrequency = row['CBetaFrequency'] || undefined;
      const english = row['EnglishTerm'] || undefined;
      const sutraName = row['SutraName'] || undefined;
      const volume = row['Volume'] || undefined;
      const originSutraText = row['ChineseSutraText'] || undefined;
      const targetSutraText = row['EnglishSutraText'] || undefined;

      return {
        id,
        glossary,
        phonetic,
        author,
        cbetaFrequency,
        english,
        sutraName,
        volume,
        originSutraText,
        targetSutraText,
        // Note: discussion field is not in the CSV but is optional in schema
        // Note: createdAt/updatedAt will be added server-side
      };
    });
  };

  const handleValidationComplete = (result: CsvValidationResult) => {
    if (result.isValid && result.composedObjects) {
      console.log('Composed glossary objects:', result.composedObjects);
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
