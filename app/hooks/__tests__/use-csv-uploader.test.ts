import { renderHook, act, waitFor } from '@testing-library/react';
import Papa from 'papaparse';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useCsvUploader } from '../use-csv-uploader';

// Mock Papa Parse
vi.mock('papaparse', () => ({
  default: {
    parse: vi.fn(),
  },
}));

const mockPapa = Papa as any;

describe('useCsvUploader', () => {
  const requiredHeaders = ['name', 'email'] as const;
  const defaultProps = {
    requiredHeaders,
    maxFileSizeBytes: 1024 * 1024, // 1MB
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should initialize with correct default state', () => {
      // Arrange
      // (defaultProps already set up)

      // Act
      const { result } = renderHook(() => useCsvUploader(defaultProps));

      // Assert
      expect(result.current.isProcessing).toBe(false);
      expect(result.current.validationResult).toBeNull();
      expect(result.current.selectedFile).toBeNull();
    });
  });

  describe('file validation', () => {
    it('should reject non-CSV files', async () => {
      // Arrange
      const { result } = renderHook(() => useCsvUploader(defaultProps));
      const file = new File(['content'], 'test.txt', { type: 'text/plain' });

      // Act
      act(() => {
        result.current.processFile(file);
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
      });

      // Assert
      expect(result.current.validationResult?.isValid).toBe(false);
      expect(result.current.validationResult?.errors).toContain('File must be a CSV file');
    });

    it('should reject files exceeding size limit', async () => {
      // Arrange
      const { result } = renderHook(() => useCsvUploader({ ...defaultProps, maxFileSizeBytes: 100 }));
      const largeContent = 'a'.repeat(200);
      const file = new File([largeContent], 'test.csv', { type: 'text/csv' });

      // Act
      act(() => {
        result.current.processFile(file);
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
      });

      // Assert
      expect(result.current.validationResult?.isValid).toBe(false);
      expect(result.current.validationResult?.errors).toContain('File size must not exceed 0MB');
    });

    it('should reject empty files', async () => {
      // Arrange
      const { result } = renderHook(() => useCsvUploader(defaultProps));
      const file = new File([''], 'test.csv', { type: 'text/csv' });

      // Act
      act(() => {
        result.current.processFile(file);
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
      });

      // Assert
      expect(result.current.validationResult?.isValid).toBe(false);
      expect(result.current.validationResult?.errors).toContain('File cannot be empty');
    });
  });

  describe('CSV parsing and validation', () => {
    it('should successfully validate a correct CSV file', async () => {
      // Arrange
      const { result } = renderHook(() => useCsvUploader(defaultProps));
      const file = new File(['name,email\nJohn,john@example.com'], 'test.csv', { type: 'text/csv' });

      mockPapa.parse.mockImplementation((file: File, options: Papa.ParseLocalConfig<Record<string, string>, File>) => {
        options.complete?.(
          {
            data: [{ name: 'John', email: 'john@example.com' }],
            errors: [],
            meta: {
              fields: ['name', 'email'],
              delimiter: ',',
              linebreak: '\n',
              aborted: false,
              truncated: false,
              cursor: 0,
            },
          },
          file,
        );
      });

      // Act
      act(() => {
        result.current.processFile(file);
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
      });

      // Assert
      expect(result.current.validationResult?.isValid).toBe(true);
      expect(result.current.validationResult?.errors).toHaveLength(0);
      expect(result.current.validationResult?.headers).toEqual(['name', 'email']);
    });

    it('should handle missing required headers', async () => {
      // Arrange
      const { result } = renderHook(() => useCsvUploader(defaultProps));
      const file = new File(['name,phone\nJohn,123456'], 'test.csv', { type: 'text/csv' });

      mockPapa.parse.mockImplementation((file: File, options: Papa.ParseLocalConfig<Record<string, string>, File>) => {
        options.complete?.(
          {
            data: [{ name: 'John', phone: '123456' }],
            errors: [],
            meta: {
              fields: ['name', 'phone'],
              delimiter: ',',
              linebreak: '\n',
              aborted: false,
              truncated: false,
              cursor: 0,
            },
          },
          file,
        );
      });

      // Act
      act(() => {
        result.current.processFile(file);
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
      });

      // Assert
      expect(result.current.validationResult?.isValid).toBe(false);
      expect(result.current.validationResult?.errors).toContain('Missing required headers: email');
    });

    it('should handle duplicate headers', async () => {
      // Arrange
      const { result } = renderHook(() => useCsvUploader(defaultProps));
      const file = new File(['name,name,email\nJohn,John,john@example.com'], 'test.csv', { type: 'text/csv' });

      mockPapa.parse.mockImplementation((file: File, options: Papa.ParseLocalConfig<Record<string, string>, File>) => {
        options.complete?.(
          {
            data: [{ name: 'John', email: 'john@example.com' }],
            errors: [],
            meta: {
              fields: ['name', 'name', 'email'],
              delimiter: ',',
              linebreak: '\n',
              aborted: false,
              truncated: false,
              cursor: 0,
            },
          },
          file,
        );
      });

      // Act
      act(() => {
        result.current.processFile(file);
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
      });

      // Assert
      expect(result.current.validationResult?.isValid).toBe(false);
      expect(result.current.validationResult?.errors).toContain('Duplicate headers found: name');
    });

    it('should handle CSV parsing errors (malformed quotes/delimiters)', async () => {
      // Arrange
      const { result } = renderHook(() => useCsvUploader(defaultProps));
      const file = new File(['name,email\n"John,john@example.com'], 'test.csv', { type: 'text/csv' });

      mockPapa.parse.mockImplementation((file: File, options: Papa.ParseLocalConfig<Record<string, string>, File>) => {
        options.complete?.(
          {
            data: [],
            errors: [
              { type: 'Quotes', code: 'InvalidQuotes', row: 1, message: 'Unescaped or mismatched quotes' },
              { type: 'Delimiter', code: 'UndetectableDelimiter', row: 2, message: 'Invalid delimiter' },
            ],
            meta: {
              fields: ['name', 'email'],
              delimiter: ',',
              linebreak: '\n',
              aborted: false,
              truncated: false,
              cursor: 0,
            },
          },
          file,
        );
      });

      // Act
      act(() => {
        result.current.processFile(file);
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
      });

      // Assert
      expect(result.current.validationResult?.isValid).toBe(false);
      expect(result.current.validationResult?.errors).toContain('Row 1: Unescaped or mismatched quotes');
      expect(result.current.validationResult?.errors).toContain('Row 2: Invalid delimiter');
    });

    it('should handle empty CSV data', async () => {
      // Arrange
      const { result } = renderHook(() => useCsvUploader(defaultProps));
      const file = new File(['name,email\n'], 'test.csv', { type: 'text/csv' });

      mockPapa.parse.mockImplementation((file: File, options: Papa.ParseLocalConfig<Record<string, string>, File>) => {
        options.complete?.(
          {
            data: [],
            errors: [],
            meta: {
              fields: ['name', 'email'],
              delimiter: ',',
              linebreak: '\n',
              aborted: false,
              truncated: false,
              cursor: 0,
            },
          },
          file,
        );
      });

      // Act
      act(() => {
        result.current.processFile(file);
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
      });

      // Assert
      expect(result.current.validationResult?.isValid).toBe(false);
      expect(result.current.validationResult?.errors).toContain('CSV file contains no data rows');
    });

    it('should handle missing headers from parsing', async () => {
      // Arrange
      const { result } = renderHook(() => useCsvUploader(defaultProps));
      const file = new File(['invalid data'], 'test.csv', { type: 'text/csv' });

      mockPapa.parse.mockImplementation((file: File, options: Papa.ParseLocalConfig<Record<string, string>, File>) => {
        options.complete?.(
          {
            data: [],
            errors: [],
            meta: { fields: undefined, delimiter: ',', linebreak: '\n', aborted: false, truncated: false, cursor: 0 },
          },
          file,
        );
      });

      // Act
      act(() => {
        result.current.processFile(file);
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
      });

      // Assert
      expect(result.current.validationResult?.isValid).toBe(false);
      expect(result.current.validationResult?.errors).toContain('Could not detect CSV headers');
    });

    it('should handle Papa Parse errors', async () => {
      // Arrange
      const { result } = renderHook(() => useCsvUploader(defaultProps));
      const file = new File(['name,email\nJohn,john@example.com'], 'test.csv', { type: 'text/csv' });

      mockPapa.parse.mockImplementation((file: File, options: Papa.ParseLocalConfig<Record<string, string>, File>) => {
        options.error?.(new Error('Parse failed'), file);
      });

      // Act
      act(() => {
        result.current.processFile(file);
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
      });

      // Assert
      expect(result.current.validationResult?.isValid).toBe(false);
      expect(result.current.validationResult?.errors).toContain('Failed to parse CSV: Parse failed');
    });
  });

  describe('callbacks', () => {
    it('should call onValidationComplete callback with results', async () => {
      // Arrange
      const onValidationComplete = vi.fn();
      const { result } = renderHook(() => useCsvUploader({ ...defaultProps, onValidationComplete }));
      const file = new File(['name,email\nJohn,john@example.com'], 'test.csv', { type: 'text/csv' });

      mockPapa.parse.mockImplementation((file: File, options: Papa.ParseLocalConfig<Record<string, string>, File>) => {
        options.complete?.(
          {
            data: [{ name: 'John', email: 'john@example.com' }],
            errors: [],
            meta: {
              fields: ['name', 'email'],
              delimiter: ',',
              linebreak: '\n',
              aborted: false,
              truncated: false,
              cursor: 0,
            },
          },
          file,
        );
      });

      // Act
      act(() => {
        result.current.processFile(file);
      });

      // Assert
      await waitFor(() => {
        expect(onValidationComplete).toHaveBeenCalledWith({
          isValid: true,
          errors: [],
          data: expect.objectContaining({
            data: [{ name: 'John', email: 'john@example.com' }],
          }),
          headers: ['name', 'email'],
          composedObjects: undefined,
        });
      });
    });
  });

  describe('state management', () => {
    it('should set processing state during file processing', async () => {
      // Arrange
      const { result } = renderHook(() => useCsvUploader(defaultProps));
      const file = new File(['name,email\nJohn,john@example.com'], 'test.csv', { type: 'text/csv' });

      // Mock Papa.parse to not call complete immediately
      mockPapa.parse.mockImplementation(() => {
        // Don't call complete immediately to test processing state
      });

      // Act
      act(() => {
        result.current.processFile(file);
      });

      // Assert
      expect(result.current.isProcessing).toBe(true);
      expect(result.current.selectedFile).toBe(file);
    });

    it('should clear file and reset state', () => {
      // Arrange
      const { result } = renderHook(() => useCsvUploader(defaultProps));
      const file = new File(['name,email\nJohn,john@example.com'], 'test.csv', { type: 'text/csv' });

      // First set some state
      act(() => {
        result.current.processFile(file);
      });

      expect(result.current.selectedFile).toBe(file);

      // Act
      act(() => {
        result.current.clearFile();
      });

      // Assert
      expect(result.current.isProcessing).toBe(false);
      expect(result.current.validationResult).toBeNull();
      expect(result.current.selectedFile).toBeNull();
    });

    it('should reset state', () => {
      // Arrange
      const { result } = renderHook(() => useCsvUploader(defaultProps));
      const file = new File(['name,email\nJohn,john@example.com'], 'test.csv', { type: 'text/csv' });

      // First set some state
      act(() => {
        result.current.processFile(file);
      });

      // Act
      act(() => {
        result.current.reset();
      });

      // Assert
      expect(result.current.isProcessing).toBe(false);
      expect(result.current.validationResult).toBeNull();
      expect(result.current.selectedFile).toBeNull();
    });
  });

  describe('Papa Parse configuration', () => {
    it('should configure Papa Parse with correct options', () => {
      // Arrange
      const { result } = renderHook(() => useCsvUploader(defaultProps));
      const file = new File(['name,email\nJohn,john@example.com'], 'test.csv', { type: 'text/csv' });

      // Act
      act(() => {
        result.current.processFile(file);
      });

      // Assert
      expect(mockPapa.parse).toHaveBeenCalledWith(
        file,
        expect.objectContaining({
          header: true,
          skipEmptyLines: true,
          complete: expect.any(Function),
          error: expect.any(Function),
        }),
      );
    });
  });

  describe('object composition', () => {
    it('should compose objects when composeObjects function is provided', async () => {
      // Arrange
      const composeObjects = vi.fn((data: Record<string, string>[]) => {
        return data.map((row, index) => ({
          id: `user_${index + 1}`,
          fullName: row.name,
          emailAddress: row.email.toLowerCase(),
        }));
      });

      const { result } = renderHook(() => useCsvUploader({ ...defaultProps, composeObjects }));
      const file = new File(['name,email\nJohn,john@example.com'], 'test.csv', { type: 'text/csv' });

      mockPapa.parse.mockImplementation((file: File, options: Papa.ParseLocalConfig<Record<string, string>, File>) => {
        options.complete?.(
          {
            data: [{ name: 'John', email: 'john@example.com' }],
            errors: [],
            meta: {
              fields: ['name', 'email'],
              delimiter: ',',
              linebreak: '\n',
              aborted: false,
              truncated: false,
              cursor: 0,
            },
          },
          file,
        );
      });

      // Act
      act(() => {
        result.current.processFile(file);
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
      });

      // Assert
      expect(composeObjects).toHaveBeenCalledWith([{ name: 'John', email: 'john@example.com' }]);
      expect(result.current.validationResult?.isValid).toBe(true);
      expect(result.current.validationResult?.composedObjects).toEqual([
        {
          id: 'user_1',
          fullName: 'John',
          emailAddress: 'john@example.com',
        },
      ]);
    });

    it('should handle composeObjects function errors', async () => {
      // Arrange
      const composeObjects = vi.fn(() => {
        throw new Error('Composition failed');
      });

      const { result } = renderHook(() => useCsvUploader({ ...defaultProps, composeObjects }));
      const file = new File(['name,email\nJohn,john@example.com'], 'test.csv', { type: 'text/csv' });

      mockPapa.parse.mockImplementation((file: File, options: Papa.ParseLocalConfig<Record<string, string>, File>) => {
        options.complete?.(
          {
            data: [{ name: 'John', email: 'john@example.com' }],
            errors: [],
            meta: {
              fields: ['name', 'email'],
              delimiter: ',',
              linebreak: '\n',
              aborted: false,
              truncated: false,
              cursor: 0,
            },
          },
          file,
        );
      });

      // Act
      act(() => {
        result.current.processFile(file);
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
      });

      // Assert
      expect(result.current.validationResult?.isValid).toBe(false);
      expect(result.current.validationResult?.errors).toContain('Failed to compose objects: Composition failed');
      expect(result.current.validationResult?.composedObjects).toBeUndefined();
    });

    it('should not call composeObjects when validation fails', async () => {
      // Arrange
      const composeObjects = vi.fn();
      const { result } = renderHook(() => useCsvUploader({ ...defaultProps, composeObjects }));
      const file = new File(['name,phone\nJohn,123456'], 'test.csv', { type: 'text/csv' });

      mockPapa.parse.mockImplementation((file: File, options: Papa.ParseLocalConfig<Record<string, string>, File>) => {
        options.complete?.(
          {
            data: [{ name: 'John', phone: '123456' }],
            errors: [],
            meta: {
              fields: ['name', 'phone'],
              delimiter: ',',
              linebreak: '\n',
              aborted: false,
              truncated: false,
              cursor: 0,
            },
          },
          file,
        );
      });

      // Act
      act(() => {
        result.current.processFile(file);
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
      });

      // Assert
      expect(composeObjects).not.toHaveBeenCalled();
      expect(result.current.validationResult?.isValid).toBe(false);
      expect(result.current.validationResult?.composedObjects).toBeUndefined();
    });

    it('should not call composeObjects when no data is present', async () => {
      // Arrange
      const composeObjects = vi.fn();
      const { result } = renderHook(() => useCsvUploader({ ...defaultProps, composeObjects }));
      const file = new File(['name,email\n'], 'test.csv', { type: 'text/csv' });

      mockPapa.parse.mockImplementation((file: File, options: Papa.ParseLocalConfig<Record<string, string>, File>) => {
        options.complete?.(
          {
            data: [],
            errors: [],
            meta: {
              fields: ['name', 'email'],
              delimiter: ',',
              linebreak: '\n',
              aborted: false,
              truncated: false,
              cursor: 0,
            },
          },
          file,
        );
      });

      // Act
      act(() => {
        result.current.processFile(file);
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
      });

      // Assert
      expect(composeObjects).not.toHaveBeenCalled();
      expect(result.current.validationResult?.isValid).toBe(false);
      expect(result.current.validationResult?.errors).toContain('CSV file contains no data rows');
    });

    it('should call onValidationComplete with composed objects', async () => {
      // Arrange
      const onValidationComplete = vi.fn();
      const composeObjects = vi.fn((data: Record<string, string>[]) => {
        return data.map((row) => ({ transformed: row.name }));
      });

      const { result } = renderHook(() =>
        useCsvUploader({
          ...defaultProps,
          onValidationComplete,
          composeObjects,
        }),
      );
      const file = new File(['name,email\nJohn,john@example.com'], 'test.csv', { type: 'text/csv' });

      mockPapa.parse.mockImplementation((file: File, options: Papa.ParseLocalConfig<Record<string, string>, File>) => {
        options.complete?.(
          {
            data: [{ name: 'John', email: 'john@example.com' }],
            errors: [],
            meta: {
              fields: ['name', 'email'],
              delimiter: ',',
              linebreak: '\n',
              aborted: false,
              truncated: false,
              cursor: 0,
            },
          },
          file,
        );
      });

      // Act
      act(() => {
        result.current.processFile(file);
      });

      // Assert
      await waitFor(() => {
        expect(onValidationComplete).toHaveBeenCalledWith({
          isValid: true,
          errors: [],
          data: expect.objectContaining({
            data: [{ name: 'John', email: 'john@example.com' }],
          }),
          headers: ['name', 'email'],
          composedObjects: [{ transformed: 'John' }],
        });
      });
    });
  });
});
