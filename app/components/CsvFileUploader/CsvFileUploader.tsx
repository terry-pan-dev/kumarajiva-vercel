import { useCallback } from 'react';

import { useCsvUploader, type CsvValidationResult } from '~/hooks/use-csv-uploader';

import { Icons } from '../icons';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui';
import { useDragDrop, useFileInput, useFileSizeUtils } from './hooks';

export interface CsvFileUploaderProps {
  requiredHeaders: readonly string[];
  maxFileSizeBytes?: number;
  onValidationComplete?: (result: CsvValidationResult) => void;
  composeObjects?: (data: Record<string, string>[]) => Record<string, any>[];
}

export const CsvFileUploader = ({
  requiredHeaders,
  maxFileSizeBytes,
  onValidationComplete,
  composeObjects,
}: CsvFileUploaderProps) => {
  const { isProcessing, validationResult, selectedFile, processFile, clearFile } = useCsvUploader({
    requiredHeaders,
    maxFileSizeBytes,
    onValidationComplete,
    composeObjects,
  });

  const { maxSizeMB, formatFileSize } = useFileSizeUtils({ maxFileSizeBytes });

  const { fileInputProps, triggerFileSelect, clearFileInput } = useFileInput({
    onFileSelect: processFile,
    accept: '.csv',
    multiple: false,
  });

  const { isDragOver, dragDropProps } = useDragDrop({
    onFileDrop: processFile,
    acceptMultiple: false,
    acceptedExtensions: ['.csv'],
  });

  const handleClearFile = useCallback(() => {
    clearFile();
    clearFileInput();
  }, [clearFile, clearFileInput]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <h4 className="mb-3 text-sm font-semibold text-foreground">Required Headers:</h4>
            <div className="flex flex-wrap gap-2">
              {requiredHeaders.map((header) => (
                <Badge
                  key={header}
                  variant="secondary"
                  className="border-blue-200 bg-blue-100 text-xs font-medium text-blue-800 hover:bg-blue-200"
                >
                  {header}
                </Badge>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Drag and Drop File Input */}
          <div className="space-y-4">
            <input {...fileInputProps} />

            {/* Drag and Drop Zone */}
            <div
              {...dragDropProps}
              onClick={triggerFileSelect}
              className={`relative cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-all duration-200 ${
                isDragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-300 hover:bg-gray-50'
              } ${isProcessing ? 'pointer-events-none opacity-60' : ''} `}
            >
              <div className="flex flex-col items-center gap-4">
                <div className={`rounded-full p-4 ${isDragOver ? 'bg-blue-100' : 'bg-gray-100'}`}>
                  <Icons.Upload className={`h-8 w-8 ${isDragOver ? 'text-blue-600' : 'text-gray-500'}`} />
                </div>

                <div className="space-y-2">
                  <h4 className="text-lg font-semibold text-gray-900">
                    {isDragOver ? 'Drop your CSV file here' : 'Drag & drop your CSV file here'}
                  </h4>
                  <p className="text-sm text-gray-600">
                    or <span className="font-medium text-blue-600">click to browse</span> files
                  </p>
                  <p className="text-xs text-gray-500">
                    Maximum file size: <span className="font-bold text-red-600">{maxSizeMB}MB</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Selected File Info */}
            {selectedFile && (
              <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="flex items-center gap-3">
                  <Icons.FileText className="h-5 w-5 text-green-600" />
                  <div>
                    <span className="font-medium text-green-900">{selectedFile.name}</span>
                    <span className="ml-2 text-sm text-green-700">({formatFileSize(selectedFile.size)})</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  disabled={isProcessing}
                  onClick={handleClearFile}
                  className="text-green-600 hover:bg-red-50 hover:text-red-600"
                >
                  <Icons.X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Processing State */}
          {isProcessing && (
            <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <Icons.Loader className="h-5 w-5 animate-spin text-blue-600" />
              <span className="text-sm font-medium text-blue-800">Processing file...</span>
            </div>
          )}

          {/* Validation Results */}
          {validationResult && (
            <div className="space-y-4">
              {validationResult.isValid ? (
                <Alert className="border-green-200 bg-green-50 text-green-800">
                  <Icons.Check className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    <div className="font-medium">✅ File validated successfully!</div>
                    <div className="mt-1 text-sm">
                      {validationResult.composedObjects
                        ? `Composed ${validationResult.composedObjects.length} objects ready for upload.`
                        : `Found ${validationResult.data?.data.length} rows ready for upload.`}
                    </div>
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive" className="border-red-200 bg-red-50">
                  <Icons.X className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    <div className="space-y-2">
                      <p className="font-semibold">❌ Validation Failed</p>
                      <ul className="list-inside list-disc space-y-1 text-sm">
                        {validationResult.errors.map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Missing Values Table */}
              {validationResult.missingValues && validationResult.missingValues.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-red-800">Missing Values Details:</h4>
                  <div className="max-h-64 overflow-y-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-20">Row</TableHead>
                          <TableHead>Missing Fields</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {validationResult.missingValues.map((entry, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-mono text-sm text-primary">{entry.rowIndex}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {entry.missingFields.map((field, fieldIndex) => (
                                  <Badge
                                    key={fieldIndex}
                                    variant="destructive"
                                    className="border-red-200 bg-red-100 text-xs text-red-800"
                                  >
                                    {field}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
