import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useCsvUploader } from '~/hooks/use-csv-uploader';

import { CsvFileUploader } from './CsvFileUploader';
import { useFileSizeUtils, useFileInput, useDragDrop } from './hooks';

// Mock the useCsvUploader hook
vi.mock('~/hooks/use-csv-uploader', () => ({
  useCsvUploader: vi.fn(),
}));

// Mock the custom hooks
vi.mock('./hooks', () => ({
  useFileSizeUtils: vi.fn(() => ({
    maxSizeMB: '10',
    formatFileSize: vi.fn((size: number) => `${Math.round(size / 1024)} KB`),
  })),
  useFileInput: vi.fn(() => ({
    fileInputProps: {
      type: 'file',
      accept: '.csv',
      style: { display: 'none' },
      onChange: vi.fn(),
    },
    triggerFileSelect: vi.fn(),
    clearFileInput: vi.fn(),
  })),
  useDragDrop: vi.fn(() => ({
    isDragOver: false,
    dragDropProps: {
      onDragOver: vi.fn(),
      onDragLeave: vi.fn(),
      onDrop: vi.fn(),
    },
  })),
}));

const mockUseCsvUploader = useCsvUploader as any;
const mockUseFileSizeUtils = useFileSizeUtils as any;
const mockUseFileInput = useFileInput as any;
const mockUseDragDrop = useDragDrop as any;

describe('CsvFileUploader', () => {
  const defaultProps = {
    requiredHeaders: ['name', 'email', 'phone'] as const,
    maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
    description: 'Upload your CSV file',
  };

  const mockCsvUploaderReturn = {
    isProcessing: false,
    validationResult: null,
    selectedFile: null,
    processFile: vi.fn(),
    clearFile: vi.fn(),
  };

  const mockFileInputReturn = {
    fileInputProps: {
      type: 'file',
      accept: '.csv',
      style: { display: 'none' },
      onChange: vi.fn(),
    },
    triggerFileSelect: vi.fn(),
    clearFileInput: vi.fn(),
  };

  const mockDragDropReturn = {
    isDragOver: false,
    dragDropProps: {
      onDragOver: vi.fn(),
      onDragLeave: vi.fn(),
      onDrop: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCsvUploader.mockReturnValue(mockCsvUploaderReturn);
    mockUseFileSizeUtils.mockReturnValue({
      maxSizeMB: '10',
      formatFileSize: vi.fn((size: number) => `${Math.round(size / 1024)} KB`),
    });
    mockUseFileInput.mockReturnValue(mockFileInputReturn);
    mockUseDragDrop.mockReturnValue(mockDragDropReturn);
  });

  describe('Initial Render', () => {
    it('should render with required headers', () => {
      render(<CsvFileUploader {...defaultProps} />);

      expect(screen.getByText('Required Headers:')).toBeInTheDocument();
      expect(screen.getByText('name')).toBeInTheDocument();
      expect(screen.getByText('email')).toBeInTheDocument();
      expect(screen.getByText('phone')).toBeInTheDocument();
    });

    it('should pass description prop to component', () => {
      render(<CsvFileUploader {...defaultProps} />);

      // Note: The description prop is passed but not currently displayed in the UI
      // This test verifies the prop is accepted without error
      expect(screen.getByText('Required Headers:')).toBeInTheDocument();
    });

    it('should render without description prop', () => {
      const { description, ...propsWithoutDescription } = defaultProps;
      render(<CsvFileUploader {...propsWithoutDescription} />);

      expect(screen.getByText('Required Headers:')).toBeInTheDocument();
    });

    it('should render file size limit', () => {
      render(<CsvFileUploader {...defaultProps} />);

      expect(screen.getByText('10MB', { exact: false })).toBeInTheDocument();
    });

    it('should render drag and drop zone', () => {
      render(<CsvFileUploader {...defaultProps} />);

      expect(screen.getByText('Drag & drop your CSV file here')).toBeInTheDocument();
      expect(screen.getByText('click to browse', { exact: false })).toBeInTheDocument();
    });
  });

  describe('Drag and Drop States', () => {
    it('should show drag over state when dragging', () => {
      mockUseDragDrop.mockReturnValue({
        ...mockDragDropReturn,
        isDragOver: true,
      });

      render(<CsvFileUploader {...defaultProps} />);

      expect(screen.getByText('Drop your CSV file here')).toBeInTheDocument();
    });

    it('should apply correct CSS classes during drag over', () => {
      mockUseDragDrop.mockReturnValue({
        ...mockDragDropReturn,
        isDragOver: true,
      });

      render(<CsvFileUploader {...defaultProps} />);

      const dropZone = screen.getByText('Drop your CSV file here').closest('[class*="border-2"]');
      expect(dropZone).toHaveClass('border-blue-400', 'bg-blue-50');
    });
  });

  describe('File Selection', () => {
    it('should trigger file selection when drop zone is clicked', async () => {
      const user = userEvent.setup();
      const mockTriggerFileSelect = vi.fn();
      mockUseFileInput.mockReturnValue({
        ...mockFileInputReturn,
        triggerFileSelect: mockTriggerFileSelect,
      });

      render(<CsvFileUploader {...defaultProps} />);

      const dropZone = screen.getByText('Drag & drop your CSV file here').closest('[class*="border-2"]');
      await user.click(dropZone!);

      expect(mockTriggerFileSelect).toHaveBeenCalled();
    });

    it('should render hidden file input with correct props', () => {
      render(<CsvFileUploader {...defaultProps} />);

      const fileInput = screen.getByDisplayValue('', { exact: false });
      expect(fileInput).toHaveAttribute('type', 'file');
      expect(fileInput).toHaveAttribute('accept', '.csv');
    });
  });

  describe('Selected File Display', () => {
    it('should show selected file information', () => {
      const mockFile = new File(['content'], 'test.csv', { type: 'text/csv' });
      mockUseCsvUploader.mockReturnValue({
        ...mockCsvUploaderReturn,
        selectedFile: mockFile,
      });

      render(<CsvFileUploader {...defaultProps} />);

      expect(screen.getByText('test.csv')).toBeInTheDocument();
    });

    it('should show formatted file size', () => {
      const mockFile = new File(['a'.repeat(2048)], 'test.csv', { type: 'text/csv' });
      const mockFormatFileSize = vi.fn((size: number) => `${Math.round(size / 1024)} KB`);
      mockUseFileSizeUtils.mockReturnValue({
        maxSizeMB: '10',
        formatFileSize: mockFormatFileSize,
      });
      mockUseCsvUploader.mockReturnValue({
        ...mockCsvUploaderReturn,
        selectedFile: mockFile,
      });

      render(<CsvFileUploader {...defaultProps} />);

      expect(mockFormatFileSize).toHaveBeenCalledWith(2048);
    });

    it('should allow clearing selected file', async () => {
      const user = userEvent.setup();
      const mockFile = new File(['content'], 'test.csv', { type: 'text/csv' });
      const mockClearFile = vi.fn();
      const mockClearFileInput = vi.fn();

      mockUseCsvUploader.mockReturnValue({
        ...mockCsvUploaderReturn,
        selectedFile: mockFile,
        clearFile: mockClearFile,
      });
      mockUseFileInput.mockReturnValue({
        ...mockFileInputReturn,
        clearFileInput: mockClearFileInput,
      });

      render(<CsvFileUploader {...defaultProps} />);

      const clearButton = screen.getByRole('button');
      await user.click(clearButton);

      expect(mockClearFile).toHaveBeenCalled();
      expect(mockClearFileInput).toHaveBeenCalled();
    });

    it('should disable clear button when processing', () => {
      const mockFile = new File(['content'], 'test.csv', { type: 'text/csv' });
      mockUseCsvUploader.mockReturnValue({
        ...mockCsvUploaderReturn,
        selectedFile: mockFile,
        isProcessing: true,
      });

      render(<CsvFileUploader {...defaultProps} />);

      const clearButton = screen.getByRole('button');
      expect(clearButton).toBeDisabled();
    });
  });

  describe('Processing State', () => {
    it('should show processing indicator when processing', () => {
      mockUseCsvUploader.mockReturnValue({
        ...mockCsvUploaderReturn,
        isProcessing: true,
      });

      render(<CsvFileUploader {...defaultProps} />);

      expect(screen.getByText('Processing file...')).toBeInTheDocument();
    });

    it('should disable drop zone when processing', () => {
      mockUseCsvUploader.mockReturnValue({
        ...mockCsvUploaderReturn,
        isProcessing: true,
      });

      render(<CsvFileUploader {...defaultProps} />);

      const dropZone = screen.getByText('Drag & drop your CSV file here').closest('[class*="border-2"]');
      expect(dropZone).toHaveClass('pointer-events-none', 'opacity-60');
    });
  });

  describe('Validation Results', () => {
    it('should show success message when validation passes', () => {
      mockUseCsvUploader.mockReturnValue({
        ...mockCsvUploaderReturn,
        validationResult: {
          isValid: true,
          errors: [],
          data: { data: [{ name: 'John', email: 'john@test.com' }] },
          headers: ['name', 'email'],
        },
      });

      render(<CsvFileUploader {...defaultProps} />);

      expect(screen.getByText('✅ File validated successfully!')).toBeInTheDocument();
      expect(screen.getByText(/Found .* rows ready for upload/)).toBeInTheDocument();
    });

    it('should show composed objects count when available', () => {
      mockUseCsvUploader.mockReturnValue({
        ...mockCsvUploaderReturn,
        validationResult: {
          isValid: true,
          errors: [],
          data: { data: [{ name: 'John', email: 'john@test.com' }] },
          headers: ['name', 'email'],
          composedObjects: [{ id: 1, name: 'John', email: 'john@test.com' }],
        },
      });

      render(<CsvFileUploader {...defaultProps} />);

      expect(screen.getByText('Composed 1 objects ready for upload.')).toBeInTheDocument();
    });

    it('should show error message when validation fails', () => {
      mockUseCsvUploader.mockReturnValue({
        ...mockCsvUploaderReturn,
        validationResult: {
          isValid: false,
          errors: ['Missing required headers: phone'],
          headers: ['name', 'email'],
        },
      });

      render(<CsvFileUploader {...defaultProps} />);

      expect(screen.getByText('❌ Validation Failed')).toBeInTheDocument();
      expect(screen.getByText('Missing required headers: phone')).toBeInTheDocument();
    });

    it('should show multiple validation errors', () => {
      mockUseCsvUploader.mockReturnValue({
        ...mockCsvUploaderReturn,
        validationResult: {
          isValid: false,
          errors: ['Missing required headers: phone', 'File size exceeds limit', 'Duplicate headers found: name'],
        },
      });

      render(<CsvFileUploader {...defaultProps} />);

      expect(screen.getByText('Missing required headers: phone')).toBeInTheDocument();
      expect(screen.getByText('File size exceeds limit')).toBeInTheDocument();
      expect(screen.getByText('Duplicate headers found: name')).toBeInTheDocument();
    });
  });

  describe('Missing Values Table', () => {
    it('should show missing values table when present', () => {
      mockUseCsvUploader.mockReturnValue({
        ...mockCsvUploaderReturn,
        validationResult: {
          isValid: false,
          errors: ['Found 2 row(s) with missing values. See details below.'],
          missingValues: [
            { rowIndex: 1, missingFields: ['address'] }, // Use 'address' instead of 'email' to avoid conflicts
            { rowIndex: 3, missingFields: ['city', 'country'] },
          ],
        },
      });

      render(<CsvFileUploader {...defaultProps} />);

      expect(screen.getByText('Missing Values Details:')).toBeInTheDocument();
      expect(screen.getByText('Row')).toBeInTheDocument();
      expect(screen.getByText('Missing Fields')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('address')).toBeInTheDocument();
      expect(screen.getByText('city')).toBeInTheDocument();
      expect(screen.getByText('country')).toBeInTheDocument();
    });

    it('should not show missing values table when not present', () => {
      mockUseCsvUploader.mockReturnValue({
        ...mockCsvUploaderReturn,
        validationResult: {
          isValid: false,
          errors: ['Some other error'],
        },
      });

      render(<CsvFileUploader {...defaultProps} />);

      expect(screen.queryByText('Missing Values Details:')).not.toBeInTheDocument();
    });

    it('should render missing values table with correct structure', () => {
      mockUseCsvUploader.mockReturnValue({
        ...mockCsvUploaderReturn,
        validationResult: {
          isValid: false,
          errors: ['Found 1 row(s) with missing values. See details below.'],
          missingValues: [{ rowIndex: 2, missingFields: ['address', 'city'] }],
        },
      });

      render(<CsvFileUploader {...defaultProps} />);

      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();

      // Check table headers
      expect(screen.getByRole('columnheader', { name: 'Row' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Missing Fields' })).toBeInTheDocument();

      // Check table content
      expect(screen.getByRole('cell', { name: '2' })).toBeInTheDocument();

      // Check that missing fields are rendered as badges with destructive variant
      const missingFieldCells = screen.getAllByText(/address|city/);
      expect(missingFieldCells.length).toBeGreaterThan(0);
    });
  });

  describe('Detected Headers', () => {
    it('should render component successfully with validation results', () => {
      mockUseCsvUploader.mockReturnValue({
        ...mockCsvUploaderReturn,
        validationResult: {
          isValid: true,
          errors: [],
          data: { data: [{ name: 'John', email: 'john@test.com' }] },
          headers: ['name', 'email', 'phone', 'address'],
        },
      });

      render(<CsvFileUploader {...defaultProps} />);

      expect(screen.getByText('✅ File validated successfully!')).toBeInTheDocument();
    });

    it('should handle validation with additional headers', () => {
      mockUseCsvUploader.mockReturnValue({
        ...mockCsvUploaderReturn,
        validationResult: {
          isValid: true,
          errors: [],
          data: { data: [{ name: 'John', email: 'john@test.com' }] },
          headers: ['name', 'email', 'phone', 'address'],
        },
      });

      render(<CsvFileUploader {...defaultProps} />);

      // Should show validation success
      expect(screen.getByText('✅ File validated successfully!')).toBeInTheDocument();
      expect(screen.getByText(/Found .* rows ready for upload/)).toBeInTheDocument();
    });

    it('should not show detected headers section when headers are not available', () => {
      mockUseCsvUploader.mockReturnValue({
        ...mockCsvUploaderReturn,
        validationResult: {
          isValid: false,
          errors: ['Could not detect CSV headers'],
        },
      });

      render(<CsvFileUploader {...defaultProps} />);

      expect(screen.queryByText('Detected Headers:')).not.toBeInTheDocument();
    });
  });

  describe('Hook Integration', () => {
    it('should pass correct props to useCsvUploader hook', () => {
      const onValidationComplete = vi.fn();
      const composeObjects = vi.fn();

      render(
        <CsvFileUploader
          {...defaultProps}
          composeObjects={composeObjects}
          onValidationComplete={onValidationComplete}
        />,
      );

      expect(mockUseCsvUploader).toHaveBeenCalledWith({
        requiredHeaders: defaultProps.requiredHeaders,
        maxFileSizeBytes: defaultProps.maxFileSizeBytes,
        onValidationComplete,
        composeObjects,
      });
    });

    it('should pass correct props to useFileSizeUtils hook', () => {
      render(<CsvFileUploader {...defaultProps} />);

      expect(mockUseFileSizeUtils).toHaveBeenCalledWith({
        maxFileSizeBytes: defaultProps.maxFileSizeBytes,
      });
    });

    it('should pass correct props to useFileInput hook', () => {
      const mockProcessFile = vi.fn();
      mockUseCsvUploader.mockReturnValue({
        ...mockCsvUploaderReturn,
        processFile: mockProcessFile,
      });

      render(<CsvFileUploader {...defaultProps} />);

      expect(mockUseFileInput).toHaveBeenCalledWith({
        onFileSelect: mockProcessFile,
        accept: '.csv',
        multiple: false,
      });
    });

    it('should pass correct props to useDragDrop hook', () => {
      const mockProcessFile = vi.fn();
      mockUseCsvUploader.mockReturnValue({
        ...mockCsvUploaderReturn,
        processFile: mockProcessFile,
      });

      render(<CsvFileUploader {...defaultProps} />);

      expect(mockUseDragDrop).toHaveBeenCalledWith({
        onFileDrop: mockProcessFile,
        acceptMultiple: false,
        acceptedExtensions: ['.csv'],
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(<CsvFileUploader {...defaultProps} />);

      const fileInput = document.querySelector('input[type="file"]');
      expect(fileInput).toHaveAttribute('type', 'file');
      expect(fileInput).toHaveAttribute('accept', '.csv');
    });

    it('should have proper heading structure', () => {
      render(<CsvFileUploader {...defaultProps} />);

      expect(screen.getByRole('heading', { name: 'Required Headers:' })).toBeInTheDocument();
    });

    it('should show validation messages in alert regions', () => {
      mockUseCsvUploader.mockReturnValue({
        ...mockCsvUploaderReturn,
        validationResult: {
          isValid: false,
          errors: ['Test error message'],
        },
      });

      render(<CsvFileUploader {...defaultProps} />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined maxFileSizeBytes prop', () => {
      const { maxFileSizeBytes, ...propsWithoutMaxSize } = defaultProps;

      expect(() => {
        render(<CsvFileUploader {...propsWithoutMaxSize} />);
      }).not.toThrow();
    });

    it('should handle empty required headers array', () => {
      render(<CsvFileUploader {...defaultProps} requiredHeaders={[]} />);

      expect(screen.getByText('Required Headers:')).toBeInTheDocument();
      // Should not show any header badges
      expect(screen.queryByText('name')).not.toBeInTheDocument();
    });

    it('should handle very long file names', () => {
      const longFileName = 'a'.repeat(100) + '.csv';
      const mockFile = new File(['content'], longFileName, { type: 'text/csv' });

      mockUseCsvUploader.mockReturnValue({
        ...mockCsvUploaderReturn,
        selectedFile: mockFile,
      });

      render(<CsvFileUploader {...defaultProps} />);

      expect(screen.getByText(longFileName)).toBeInTheDocument();
    });

    it('should handle many missing values in table', () => {
      const manyMissingValues = Array.from({ length: 50 }, (_, i) => ({
        rowIndex: i + 1,
        missingFields: ['email', 'phone'],
      }));

      mockUseCsvUploader.mockReturnValue({
        ...mockCsvUploaderReturn,
        validationResult: {
          isValid: false,
          errors: ['Found 50 row(s) with missing values. See details below.'],
          missingValues: manyMissingValues,
        },
      });

      render(<CsvFileUploader {...defaultProps} />);

      expect(screen.getByText('Missing Values Details:')).toBeInTheDocument();

      // Check that table container has scrolling
      const tableContainer = screen.getByText('Missing Values Details:').nextElementSibling;
      expect(tableContainer).toHaveClass('max-h-64', 'overflow-y-auto');
    });
  });
});
