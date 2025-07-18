import { AlertCircle } from 'lucide-react';
import React, { useState, useCallback, useMemo } from 'react';

import type { ReadSutra, ReadRoll } from '~/drizzle/tables';

import { type CsvValidationResult } from '~/hooks/use-csv-uploader';
import { glossaryCsvUploadSchema, REQUIRED_GLOSSARY_HEADERS } from '~/validations/glossary-upload.validation';
import { paragraphUploadSchema } from '~/validations/paragraph-upload.validation';

import { CreateChapterDialog } from './CreateChapterDialog';
import { CreateSutraDialog } from './CreateSutraDialog';
import { CsvFileUploader } from './CsvFileUploader';
import { FormModal } from './FormModal';
import { Icons } from './icons';
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui';

type SutraWithRolls = ReadSutra & {
  rolls?: (
    | ReadRoll
    | {
        id: string;
        title: string;
        subtitle: string;
        parentId: string | null;
        sutraId: string;
        createdAt: string;
        updatedAt: string;
        deletedAt: string | null;
        createdBy: string;
        updatedBy: string;
      }
  )[];
};

interface UploadActionButtonsProps {
  onGlossaryUpload?: (results: Record<string, any>[]) => void;
  onParagraphUpload?: (results: Record<string, any>[]) => void;
  sutras?: SutraWithRolls[];
}

export default function UploadActionButtons({
  onGlossaryUpload,
  onParagraphUpload,
  sutras = [],
}: UploadActionButtonsProps = {}) {
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

  const uploadParagraphModal = (
    <FormModal
      kind="upload-paragraph"
      title="Upload Paragraphs"
      schema={paragraphUploadSchema}
      trigger={
        <Button
          size="icon"
          variant="outline"
          className="h-12 w-12 rounded-full shadow-lg transition-all duration-300 ease-in-out"
        >
          <Icons.LetterP className="h-4 w-4" />
        </Button>
      }
    >
      <UploadParagraphForm sutras={sutras} onValidationComplete={onParagraphUpload} />
    </FormModal>
  );

  const createChapterModal = (
    <CreateChapterDialog
      sutras={sutras}
      trigger={
        <Button
          size="icon"
          variant="outline"
          className="h-12 w-12 rounded-full shadow-lg transition-all duration-300 ease-in-out"
        >
          <Icons.LetterC className="h-4 w-4" />
        </Button>
      }
    />
  );

  const createSutraModal = (
    <CreateSutraDialog
      sutras={sutras}
      trigger={
        <Button
          size="icon"
          variant="outline"
          className="h-12 w-12 rounded-full shadow-lg transition-all duration-300 ease-in-out"
        >
          <Icons.LetterS className="h-4 w-4" />
        </Button>
      }
    />
  );

  return (
    <TooltipProvider>
      <div className="fixed bottom-6 right-6">
        <div className="relative">
          {isExpanded && (
            <div className="absolute bottom-16 right-0 flex flex-col-reverse items-center gap-3">
              {[
                { modal: uploadGlossaryModal, tooltip: 'Upload Glossary' },
                { modal: uploadParagraphModal, tooltip: 'Upload Paragraphs' },
                { modal: createChapterModal, tooltip: 'Create Chapter' },
                { modal: createSutraModal, tooltip: 'Create Sutra' },
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
  // This matches the validation schema structure for bulk upload
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

interface UploadParagraphFormProps {
  onValidationComplete?: (results: Record<string, any>[]) => void;
  sutras?: SutraWithRolls[];
}

const UploadParagraphForm = ({ onValidationComplete, sutras = [] }: UploadParagraphFormProps) => {
  const [validationResult, setValidationResult] = useState<CsvValidationResult | null>(null);
  const [selectedSutra, setSelectedSutra] = useState<string>('');
  const [selectedRoll, setSelectedRoll] = useState<string>('');
  const [targetSutraValidationError, setTargetSutraValidationError] = useState<string>('');

  // Get rolls for the selected sutra
  const selectedSutraData = useMemo(() => sutras.find((s) => s.id === selectedSutra), [sutras, selectedSutra]);
  const availableRolls = useMemo(() => selectedSutraData?.rolls || [], [selectedSutraData]);

  // Function to compose CSV data into paragraph objects
  const composeParagraphObjects = (data: Record<string, string>[]) => {
    return data.map((row) => {
      const originSutra = row['OriginSutra'];
      const targetSutra = row['TargetSutra'];

      // Extract reference fields (any fields other than required ones)
      const references = Object.entries(row)
        .filter(([key]) => !['OriginSutra', 'TargetSutra'].includes(key))
        .map(([sutraName, content], index) => ({
          sutraName,
          content: content || '',
          order: String(index),
        }))
        .filter((ref) => ref.content.trim() !== '');

      return {
        originSutra,
        targetSutra,
        references,
      };
    });
  };

  // Check if TargetSutra column exists and validate corresponding English sutra/chapter
  const validateTargetSutra = useCallback(
    (data: Record<string, string>[]) => {
      const hasTargetSutraColumn = data.some((row) => 'TargetSutra' in row && row['TargetSutra']?.trim());

      if (!hasTargetSutraColumn) {
        setTargetSutraValidationError('');
        return true;
      }

      // Only validate if user has selected both sutra and chapter
      if (!selectedSutra || !selectedRoll) {
        setTargetSutraValidationError('');
        return true;
      }

      // Find English sutras using the language field from the database schema
      const englishSutras = sutras.filter((sutra) => sutra.language === 'english');

      if (englishSutras.length === 0) {
        setTargetSutraValidationError('No English sutras found. Please create English sutras first.');
        return false;
      }

      // Check if selected sutra has English equivalent
      // For Chinese sutras, look for English translations (parentId points to the Chinese sutra)
      const selectedSutraTitle = selectedSutraData?.title;
      const correspondingEnglishSutra = englishSutras.find(
        (sutra) =>
          sutra.parentId === selectedSutra ||
          sutra.title.toLowerCase().includes(
            selectedSutraTitle
              ?.toLowerCase()
              .replace(/english/gi, '')
              .trim() || '',
          ),
      );

      if (!correspondingEnglishSutra) {
        setTargetSutraValidationError(
          `No corresponding English sutra found for "${selectedSutraTitle}". Please create the English sutra and chapter first.`,
        );
        return false;
      }

      // Check if English sutra has corresponding chapter
      const selectedRollTitle = availableRolls.find((roll) => roll.id === selectedRoll)?.title;
      const correspondingEnglishRoll = correspondingEnglishSutra.rolls?.find(
        (roll) =>
          roll.title.toLowerCase().includes(
            selectedRollTitle
              ?.toLowerCase()
              .replace(/english/gi, '')
              .trim() || '',
          ) || roll.title === selectedRollTitle,
      );

      if (!correspondingEnglishRoll) {
        setTargetSutraValidationError(
          `No corresponding English chapter found for "${selectedRollTitle}" in sutra "${correspondingEnglishSutra.title}". Please create the English chapter first.`,
        );
        return false;
      }

      setTargetSutraValidationError('');
      return true;
    },
    [selectedSutra, selectedRoll, sutras, selectedSutraData, availableRolls],
  );

  const handleValidationComplete = (result: CsvValidationResult) => {
    setValidationResult(result);
    // Don't validate or call onValidationComplete immediately
    // Wait for user to select sutra and chapter
  };

  // Function to handle final validation and submission
  const handleFormSubmit = useCallback(() => {
    if (!validationResult?.isValid || !validationResult.composedObjects || !onValidationComplete) {
      return;
    }

    // Validate TargetSutra requirements when user submits
    if (!validateTargetSutra(validationResult.data?.data || [])) {
      return;
    }

    // Add sutra and roll information to the composed objects
    const dataWithSelection = {
      sutraId: selectedSutra,
      rollId: selectedRoll,
      data: validationResult.composedObjects,
    };
    onValidationComplete([dataWithSelection]);
  }, [validationResult, onValidationComplete, selectedSutra, selectedRoll, validateTargetSutra]);

  const requiredHeaders = ['OriginSutra'];
  const isFormValid = selectedSutra && selectedRoll && validationResult?.isValid && !targetSutraValidationError;

  // Auto-submit when form becomes valid
  React.useEffect(() => {
    if (isFormValid) {
      handleFormSubmit();
    }
  }, [isFormValid, handleFormSubmit]);

  return (
    <div className="space-y-4">
      {/* Show dropdown lists after CSV upload */}
      {validationResult?.isValid && (
        <div className="space-y-4">
          <h3 className="text-md font-medium">Select Sutra and Chapter to upload to</h3>

          {/* Show uploaded CSV column names */}
          <div className="rounded-md bg-green-50 p-3">
            <p className="mb-2 text-sm font-medium text-green-800">Uploaded CSV columns:</p>
            <div className="flex flex-wrap gap-2">
              {validationResult.headers?.map((header: string, index: number) => (
                <span
                  key={index}
                  className={`rounded-md px-2 py-1 text-xs font-medium ${
                    header === 'OriginSutra'
                      ? 'bg-blue-100 text-blue-800'
                      : header === 'TargetSutra'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {header}
                  {header === 'OriginSutra' && ' (required)'}
                  {header === 'TargetSutra' && ' (optional)'}
                  {header !== 'OriginSutra' && header !== 'TargetSutra' && ' (reference)'}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium">Select Sutra *</label>
              <select
                value={selectedSutra}
                className="w-full rounded-md border border-gray-300 p-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                onChange={(e) => {
                  setSelectedSutra(e.target.value);
                  setSelectedRoll(''); // Reset roll selection when sutra changes
                  setTargetSutraValidationError(''); // Clear previous errors
                  // Validate when sutra changes (if roll is also selected)
                  if (validationResult?.data?.data) {
                    setTimeout(() => validateTargetSutra(validationResult.data?.data || []), 0);
                  }
                }}
              >
                <option value="">Choose a sutra...</option>
                {sutras.map((sutra) => (
                  <option key={sutra.id} value={sutra.id}>
                    {sutra.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Select Chapter *</label>
              <select
                value={selectedRoll}
                disabled={!selectedSutra}
                className="w-full rounded-md border border-gray-300 p-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100"
                onChange={(e) => {
                  setSelectedRoll(e.target.value);
                  setTargetSutraValidationError(''); // Clear previous errors
                  // Validate when roll changes (if sutra is also selected)
                  if (validationResult?.data?.data && selectedSutra) {
                    setTimeout(() => validateTargetSutra(validationResult.data?.data || []), 0);
                  }
                }}
              >
                <option value="">Choose a chapter...</option>
                {availableRolls.map((roll) => (
                  <option key={roll.id} value={roll.id}>
                    {roll.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Show TargetSutra validation error */}
          {targetSutraValidationError && (
            <div className="rounded-lg bg-red-50 p-4">
              <div className="flex items-center gap-2 text-red-800">
                <AlertCircle className="h-5 w-5" />
                <span className="font-medium">Validation Error</span>
              </div>
              <p className="mt-1 text-sm text-red-700">{targetSutraValidationError}</p>
            </div>
          )}
        </div>
      )}

      {/* Upload area */}
      <div className="space-y-2">
        <div className="rounded-md bg-blue-50 p-3">
          <p className="text-sm text-blue-800">
            <strong>Required:</strong> OriginSutra
          </p>
          <p className="text-sm text-blue-700">
            <strong>Optional:</strong> TargetSutra, Reference columns
          </p>
          <p className="mt-1 text-xs text-blue-600">Additional fields will be treated as references.</p>
        </div>

        <CsvFileUploader
          requiredHeaders={requiredHeaders}
          maxFileSizeBytes={10 * 1024 * 1024} // 10MB
          composeObjects={composeParagraphObjects}
          onValidationComplete={handleValidationComplete}
        />
      </div>

      {isFormValid && (
        <div className="rounded-lg bg-green-50 p-4">
          <div className="flex items-center gap-2 text-green-800">
            <Icons.Check className="h-5 w-5" />
            <span className="font-medium">Ready to upload!</span>
          </div>
          <p className="mt-1 text-sm text-green-700">
            Your CSV file has been validated and contains{' '}
            {validationResult.composedObjects?.length || validationResult.data?.data.length} paragraph entries. Click
            "Save" to proceed with the upload.
          </p>
        </div>
      )}
    </div>
  );
};
