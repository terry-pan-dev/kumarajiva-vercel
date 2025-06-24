import { useState } from 'react';
import { z } from 'zod';

import { type CsvValidationResult } from '~/hooks/use-csv-uploader';
import { glossaryCsvUploadSchema, REQUIRED_GLOSSARY_HEADERS } from '~/validations/glossary-upload.validation';

import { CsvFileUploader } from './CsvFileUploader';
import { FormModal } from './FormModal';
import { Icons } from './icons';
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui';

// Utility function to normalize text to searchable ASCII
const normalizeToSearchable = (text: string): string => {
  return text
    .normalize('NFD') // Decompose accented characters
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritical marks
    .toLowerCase()
    .trim();
};

interface UploadActionButtonsProps {
  onGlossaryUpload?: (results: Record<string, any>[]) => void;
}

export default function UploadActionButtons({ onGlossaryUpload }: UploadActionButtonsProps = {}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const uploadGlossaryModal = (
    <FormModal
      kind="upload-glossary"
      title="Upload Glossary CSV"
      schema={glossaryCsvUploadSchema}
      trigger={
        <Button
          size="icon"
          variant="outline"
          className="h-12 w-12 rounded-full shadow-lg transition-all duration-300 ease-in-out"
        >
          <Icons.LetterG className="h-4 w-4" />
        </Button>
      }
    >
      <UploadGlossaryForm onValidationComplete={onGlossaryUpload} />
    </FormModal>
  );

  // Placeholder schema for sutra upload - to be implemented later
  const placeholderSchema = z.object({});

  const uploadSutraModal = (
    <FormModal
      kind="upload-sutra"
      title="Upload Sutra"
      schema={placeholderSchema}
      trigger={
        <Button
          size="icon"
          variant="outline"
          className="h-12 w-12 rounded-full shadow-lg transition-all duration-300 ease-in-out"
        >
          <Icons.LetterS className="h-4 w-4" />
        </Button>
      }
    >
      <UploadSutraForm />
    </FormModal>
  );

  return (
    <TooltipProvider>
      <div className="fixed bottom-6 right-6">
        <div className="relative">
          {isExpanded && (
            <div className="absolute bottom-16 right-0 flex flex-col-reverse items-center gap-3">
              {[
                { modal: uploadGlossaryModal, tooltip: 'Upload Glossary' },
                { modal: uploadSutraModal, tooltip: 'Upload Sutra' },
              ].map(({ modal, tooltip }, index) => (
                <Tooltip key={index}>
                  <TooltipTrigger asChild>
                    <div>
                      {modal}
                      <span className="sr-only">{tooltip}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p>{tooltip}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}
          <Button
            size="icon"
            onClick={toggleExpand}
            aria-expanded={isExpanded}
            title={isExpanded ? 'Collapse actions' : 'Expand actions'}
            aria-label={isExpanded ? 'Collapse actions' : 'Expand actions'}
            className="h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90"
          >
            <Icons.Upload className={`h-5 w-5 transition-transform duration-300 ${isExpanded ? 'rotate-45' : ''}`} />
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}

interface UploadGlossaryFormProps {
  onValidationComplete?: (results: Record<string, any>[]) => void;
}

const UploadGlossaryForm = ({ onValidationComplete }: UploadGlossaryFormProps) => {
  const [validationResult, setValidationResult] = useState<CsvValidationResult | null>(null);

  // Function to compose CSV data into glossary objects
  const composeGlossaryObjects = (data: Record<string, string>[]) => {
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
          subscribers: 0,
          translations: [translation],
        };
      }
    });

    return Object.values(obj);
  };

  const handleValidationComplete = (result: CsvValidationResult) => {
    setValidationResult(result);
    if (result.isValid && result.composedObjects && onValidationComplete) {
      onValidationComplete(result.composedObjects);
    }
  };

  return (
    <div className="space-y-4">
      <CsvFileUploader
        maxFileSizeBytes={10 * 1024 * 1024} // 10MB
        composeObjects={composeGlossaryObjects}
        requiredHeaders={REQUIRED_GLOSSARY_HEADERS}
        onValidationComplete={handleValidationComplete}
      />

      {validationResult?.isValid && (
        <div className="rounded-lg bg-green-50 p-4">
          <div className="flex items-center gap-2 text-green-800">
            <Icons.Check className="h-5 w-5" />
            <span className="font-medium">Ready to upload!</span>
          </div>
          <p className="mt-1 text-sm text-green-700">
            Your CSV file has been validated and contains{' '}
            {validationResult.composedObjects?.length || validationResult.data?.data.length} glossary entries. Click
            "Save" to proceed with the upload.
          </p>
        </div>
      )}
    </div>
  );
};

const UploadSutraForm = () => {
  return (
    <div className="p-4 text-center">
      <div className="mb-4">
        <Icons.LetterS className="mx-auto h-12 w-12 text-muted-foreground" />
      </div>
      <h3 className="mb-2 text-lg font-semibold">Upload Sutra</h3>
      <p className="text-muted-foreground">
        Sutra upload functionality will be implemented here.
        <br />
        This is a placeholder for the upload form.
      </p>
    </div>
  );
};
