import { useState } from 'react';

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

  // Get rolls for the selected sutra
  const selectedSutraData = sutras.find((s) => s.id === selectedSutra);
  const availableRolls = selectedSutraData?.rolls || [];

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

  const handleValidationComplete = (result: CsvValidationResult) => {
    setValidationResult(result);
    if (result.isValid && result.composedObjects && onValidationComplete) {
      // Add sutra and roll information to the composed objects
      const dataWithSelection = {
        sutraId: selectedSutra,
        rollId: selectedRoll,
        data: result.composedObjects,
      };
      onValidationComplete([dataWithSelection]);
    }
  };

  const requiredHeaders = ['OriginSutra', 'TargetSutra'];
  const isFormValid = selectedSutra && selectedRoll && validationResult?.isValid;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-2 block text-sm font-medium">Select Sutra</label>
          <select
            value={selectedSutra}
            className="w-full rounded-md border border-gray-300 p-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            onChange={(e) => {
              setSelectedSutra(e.target.value);
              setSelectedRoll(''); // Reset roll selection when sutra changes
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
          <label className="mb-2 block text-sm font-medium">Select Chapter</label>
          <select
            value={selectedRoll}
            disabled={!selectedSutra}
            onChange={(e) => setSelectedRoll(e.target.value)}
            className="w-full rounded-md border border-gray-300 p-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100"
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

      {selectedSutra && selectedRoll && (
        <div className="border-t pt-4">
          <h4 className="mb-2 font-medium">Upload CSV File</h4>
          <p className="mb-4 text-sm text-gray-600">
            Required fields: <strong>OriginSutra</strong>, <strong>TargetSutra</strong>
            <br />
            Additional fields will be treated as references.
          </p>

          <CsvFileUploader
            requiredHeaders={requiredHeaders}
            maxFileSizeBytes={10 * 1024 * 1024} // 10MB
            composeObjects={composeParagraphObjects}
            onValidationComplete={handleValidationComplete}
          />
        </div>
      )}

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
