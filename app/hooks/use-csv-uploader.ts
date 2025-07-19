import Papa from 'papaparse';
import { useCallback, useState } from 'react';

export interface MissingValueEntry {
  rowIndex: number;
  missingFields: string[];
}

export interface CsvValidationResult {
  isValid: boolean;
  errors: string[];
  data?: Papa.ParseResult<Record<string, string>>;
  headers?: string[];
  composedObjects?: Record<string, any>[];
  missingValues?: MissingValueEntry[];
}

export interface UseCsvUploaderProps {
  requiredHeaders: readonly string[];
  maxFileSizeBytes?: number;
  onValidationComplete?: (result: CsvValidationResult) => void;
  composeObjects?: (data: Record<string, string>[]) => Record<string, any>[];
}

export interface CsvUploaderState {
  isProcessing: boolean;
  validationResult: CsvValidationResult | null;
  selectedFile: File | null;
}

export const useCsvUploader = ({
  requiredHeaders,
  maxFileSizeBytes = 10 * 1024 * 1024, // 10MB default
  onValidationComplete,
  composeObjects,
}: UseCsvUploaderProps) => {
  const [state, setState] = useState<CsvUploaderState>({
    isProcessing: false,
    validationResult: null,
    selectedFile: null,
  });

  const validateFile = useCallback(
    (file: File): string[] => {
      const errors: string[] = [];

      // Check file type
      if (!file.name.toLowerCase().endsWith('.csv')) {
        errors.push('File must be a CSV file');
      }

      // Check file size
      if (file.size > maxFileSizeBytes) {
        const maxSizeMB = Math.round(maxFileSizeBytes / (1024 * 1024));
        errors.push(`File size must not exceed ${maxSizeMB}MB`);
      }

      // Check if file is empty
      if (file.size === 0) {
        errors.push('File cannot be empty');
      }

      return errors;
    },
    [maxFileSizeBytes],
  );

  const validateHeaders = useCallback(
    (headers: string[]): string[] => {
      const errors: string[] = [];
      const normalizedHeaders = headers.map((h) => h.trim());
      const missingHeaders: string[] = [];

      // Check for required headers
      requiredHeaders.forEach((requiredHeader) => {
        if (!normalizedHeaders.includes(requiredHeader)) {
          missingHeaders.push(requiredHeader);
        }
      });

      if (missingHeaders.length > 0) {
        errors.push(`Missing required headers: ${missingHeaders.join(', ')}`);
      }

      // Check for duplicate headers
      const duplicates = normalizedHeaders.filter((header, index) => normalizedHeaders.indexOf(header) !== index);
      if (duplicates.length > 0) {
        errors.push(`Duplicate headers found: ${[...new Set(duplicates)].join(', ')}`);
      }

      return errors;
    },
    [requiredHeaders],
  );

  const validateDataValues = useCallback(
    (
      data: Record<string, string>[],
      headers: string[],
      requiredHeaders: readonly string[],
    ): { errors: string[]; missingValues: MissingValueEntry[] } => {
      const errors: string[] = [];
      const missingValues: MissingValueEntry[] = [];

      data.forEach((row, index) => {
        const missingFields: string[] = [];

        headers.forEach((header) => {
          const value = row[header];
          const trimmedValue = value?.toString().trim() || '';

          // For required headers, value must not be empty
          if (requiredHeaders.includes(header)) {
            if (!trimmedValue) {
              missingFields.push(header);
            }
          }
          // For TargetSutra and Reference columns: if present and not null/undefined, must be non-empty
          else if (header === 'TargetSutra' || (header !== 'OriginSutra' && header !== 'TargetSutra')) {
            // Only validate if the value is explicitly provided (not null/undefined)
            // but if provided, it must not be empty after trimming
            if (value != null && trimmedValue === '') {
              missingFields.push(header);
            }
          }
        });

        if (missingFields.length > 0) {
          missingValues.push({
            rowIndex: index + 1, // 1-based index for user display
            missingFields,
          });
        }
      });

      if (missingValues.length > 0) {
        errors.push(`Found ${missingValues.length} row(s) with missing values. See details below.`);
      }

      return { errors, missingValues };
    },
    [],
  );

  const processFile = useCallback(
    (file: File) => {
      setState((prev) => ({
        ...prev,
        isProcessing: true,
        selectedFile: file,
        validationResult: null,
      }));

      // First validate file properties
      const fileErrors = validateFile(file);
      if (fileErrors.length > 0) {
        const result: CsvValidationResult = {
          isValid: false,
          errors: fileErrors,
        };
        setState((prev) => ({
          ...prev,
          isProcessing: false,
          validationResult: result,
        }));
        onValidationComplete?.(result);
        return;
      }

      // Parse CSV
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        delimiter: '', // Let Papa Parse auto-detect, but be more forgiving
        delimitersToGuess: [',', '\t', '|', ';'], // Common delimiters to try
        complete: (results: Papa.ParseResult<Record<string, string>>) => {
          const errors: string[] = [];

          // Check for parsing errors, but be more lenient for single-column files
          if (results.errors.length > 0) {
            const significantErrors = results.errors.filter((error) => {
              // Filter out delimiter detection warnings for single-column files
              if (error.type === 'Delimiter' && error.message?.includes('auto-detect delimiting character')) {
                // Check if we have valid data despite the warning
                return results.data.length === 0 || !results.meta.fields || results.meta.fields.length === 0;
              }
              return error.type === 'Quotes' || error.type === 'Delimiter';
            });

            const parseErrors = significantErrors.map((error) => `Row ${error.row}: ${error.message}`);
            errors.push(...parseErrors);
          }

          // Validate headers
          if (results.meta.fields) {
            const headerErrors = validateHeaders(results.meta.fields);
            errors.push(...headerErrors);
          } else {
            errors.push('Could not detect CSV headers');
          }

          // Check if there's any data
          if (results.data.length === 0) {
            errors.push('CSV file contains no data rows');
          }

          // Validate data values for missing fields
          let missingValues: MissingValueEntry[] = [];
          if (results.data.length > 0 && results.meta.fields) {
            const valueValidation = validateDataValues(results.data, results.meta.fields, requiredHeaders);
            errors.push(...valueValidation.errors);
            missingValues = valueValidation.missingValues;
          }

          // Compose objects if function provided and validation passed
          let composedObjects: Record<string, any>[] | undefined;
          if (errors.length === 0 && composeObjects && results.data.length > 0) {
            try {
              composedObjects = composeObjects(results.data);
            } catch (error) {
              errors.push(`Failed to compose objects: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }

          const result: CsvValidationResult = {
            isValid: errors.length === 0,
            errors,
            data: results,
            headers: results.meta.fields,
            composedObjects,
            missingValues: missingValues.length > 0 ? missingValues : undefined,
          };

          setState((prev) => ({
            ...prev,
            isProcessing: false,
            validationResult: result,
          }));

          onValidationComplete?.(result);
        },
        error: (error: Error) => {
          const result: CsvValidationResult = {
            isValid: false,
            errors: [`Failed to parse CSV: ${error.message}`],
          };

          setState((prev) => ({
            ...prev,
            isProcessing: false,
            validationResult: result,
          }));

          onValidationComplete?.(result);
        },
      });
    },
    [validateFile, validateHeaders, validateDataValues, onValidationComplete, composeObjects, requiredHeaders],
  );

  const clearFile = useCallback(() => {
    setState({
      isProcessing: false,
      validationResult: null,
      selectedFile: null,
    });
  }, []);

  const reset = useCallback(() => {
    clearFile();
  }, [clearFile]);

  return {
    ...state,
    processFile,
    clearFile,
    reset,
  };
};
