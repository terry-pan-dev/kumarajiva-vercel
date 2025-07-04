import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';

import { useFileSizeUtils } from './use-file-size-utils';

describe('useFileSizeUtils', () => {
  describe('default configuration', () => {
    it('should return default values when no props are provided', () => {
      const { result } = renderHook(() => useFileSizeUtils());

      expect(result.current.maxFileSizeBytes).toBe(10 * 1024 * 1024); // 10MB
      expect(result.current.maxSizeMB).toBe(10);
      expect(typeof result.current.formatFileSize).toBe('function');
      expect(typeof result.current.isFileSizeValid).toBe('function');
    });

    it('should return default values when empty object is provided', () => {
      const { result } = renderHook(() => useFileSizeUtils({}));

      expect(result.current.maxFileSizeBytes).toBe(10 * 1024 * 1024); // 10MB
      expect(result.current.maxSizeMB).toBe(10);
    });
  });

  describe('custom configuration', () => {
    it('should use custom maxFileSizeBytes when provided', () => {
      const customSize = 5 * 1024 * 1024; // 5MB
      const { result } = renderHook(() => useFileSizeUtils({ maxFileSizeBytes: customSize }));

      expect(result.current.maxFileSizeBytes).toBe(customSize);
      expect(result.current.maxSizeMB).toBe(5);
    });

    it('should calculate maxSizeMB correctly for various sizes', () => {
      const testCases = [
        { bytes: 1024 * 1024, expectedMB: 1 }, // 1MB
        { bytes: 2.5 * 1024 * 1024, expectedMB: 3 }, // 2.5MB rounds to 3MB
        { bytes: 15 * 1024 * 1024, expectedMB: 15 }, // 15MB
        { bytes: 1023 * 1024, expectedMB: 1 }, // Just under 1MB rounds to 1MB
        { bytes: 1.4 * 1024 * 1024, expectedMB: 1 }, // 1.4MB rounds to 1MB
        { bytes: 1.6 * 1024 * 1024, expectedMB: 2 }, // 1.6MB rounds to 2MB
      ];

      testCases.forEach(({ bytes, expectedMB }) => {
        const { result } = renderHook(() => useFileSizeUtils({ maxFileSizeBytes: bytes }));
        expect(result.current.maxSizeMB).toBe(expectedMB);
      });
    });

    it('should handle zero and very small sizes', () => {
      const { result: zeroResult } = renderHook(() => useFileSizeUtils({ maxFileSizeBytes: 0 }));
      expect(zeroResult.current.maxSizeMB).toBe(0);

      const { result: smallResult } = renderHook(() => useFileSizeUtils({ maxFileSizeBytes: 512 }));
      expect(smallResult.current.maxSizeMB).toBe(0); // 512 bytes rounds to 0MB
    });

    it('should handle very large sizes', () => {
      const largeSize = 100 * 1024 * 1024; // 100MB
      const { result } = renderHook(() => useFileSizeUtils({ maxFileSizeBytes: largeSize }));

      expect(result.current.maxFileSizeBytes).toBe(largeSize);
      expect(result.current.maxSizeMB).toBe(100);
    });
  });

  describe('formatFileSize function', () => {
    let formatFileSize: (sizeInBytes: number) => string;

    beforeEach(() => {
      const { result } = renderHook(() => useFileSizeUtils());
      formatFileSize = result.current.formatFileSize;
    });

    describe('bytes formatting', () => {
      it('should format sizes less than 1KB in bytes', () => {
        expect(formatFileSize(0)).toBe('0B');
        expect(formatFileSize(1)).toBe('1B');
        expect(formatFileSize(512)).toBe('512B');
        expect(formatFileSize(1023)).toBe('1023B');
      });
    });

    describe('kilobytes formatting', () => {
      it('should format sizes between 1KB and 1MB in kilobytes', () => {
        expect(formatFileSize(1024)).toBe('1KB'); // Exactly 1KB
        expect(formatFileSize(1536)).toBe('2KB'); // 1.5KB rounds to 2KB
        expect(formatFileSize(2048)).toBe('2KB'); // Exactly 2KB
        expect(formatFileSize(2560)).toBe('3KB'); // 2.5KB rounds to 3KB
        expect(formatFileSize(10240)).toBe('10KB'); // Exactly 10KB
        expect(formatFileSize(1048575)).toBe('1024KB'); // Just under 1MB
      });

      it('should round kilobytes correctly', () => {
        expect(formatFileSize(1024 + 256)).toBe('1KB'); // 1.25KB rounds to 1KB
        expect(formatFileSize(1024 + 512)).toBe('2KB'); // 1.5KB rounds to 2KB
        expect(formatFileSize(1024 + 768)).toBe('2KB'); // 1.75KB rounds to 2KB
      });
    });

    describe('megabytes formatting', () => {
      it('should format sizes 1MB and above in megabytes', () => {
        expect(formatFileSize(1024 * 1024)).toBe('1MB'); // Exactly 1MB
        expect(formatFileSize(1.5 * 1024 * 1024)).toBe('2MB'); // 1.5MB rounds to 2MB
        expect(formatFileSize(2 * 1024 * 1024)).toBe('2MB'); // Exactly 2MB
        expect(formatFileSize(2.7 * 1024 * 1024)).toBe('3MB'); // 2.7MB rounds to 3MB
        expect(formatFileSize(10 * 1024 * 1024)).toBe('10MB'); // Exactly 10MB
        expect(formatFileSize(100 * 1024 * 1024)).toBe('100MB'); // Exactly 100MB
      });

      it('should round megabytes correctly', () => {
        expect(formatFileSize(1024 * 1024 + 256 * 1024)).toBe('1MB'); // 1.25MB rounds to 1MB
        expect(formatFileSize(1024 * 1024 + 512 * 1024)).toBe('2MB'); // 1.5MB rounds to 2MB
        expect(formatFileSize(1024 * 1024 + 768 * 1024)).toBe('2MB'); // 1.75MB rounds to 2MB
      });
    });

    describe('edge cases', () => {
      it('should handle boundary values correctly', () => {
        expect(formatFileSize(1023)).toBe('1023B'); // Just under 1KB
        expect(formatFileSize(1024)).toBe('1KB'); // Exactly 1KB
        expect(formatFileSize(1048575)).toBe('1024KB'); // Just under 1MB
        expect(formatFileSize(1048576)).toBe('1MB'); // Exactly 1MB
      });

      it('should handle very large file sizes', () => {
        const veryLargeSize = 1000 * 1024 * 1024; // 1000MB
        expect(formatFileSize(veryLargeSize)).toBe('1000MB');
      });
    });
  });

  describe('isFileSizeValid function', () => {
    describe('with default size limit (10MB)', () => {
      let isFileSizeValid: (file: File) => boolean;

      beforeEach(() => {
        const { result } = renderHook(() => useFileSizeUtils());
        isFileSizeValid = result.current.isFileSizeValid;
      });

      it('should return true for files within size limit', () => {
        const validSizes = [
          0, // Empty file
          1024, // 1KB
          1024 * 1024, // 1MB
          5 * 1024 * 1024, // 5MB
          10 * 1024 * 1024, // Exactly 10MB (at limit)
        ];

        validSizes.forEach((size) => {
          const file = new File(['x'.repeat(size)], 'test.txt', { type: 'text/plain' });
          expect(isFileSizeValid(file)).toBe(true);
        });
      });

      it('should return false for files exceeding size limit', () => {
        const invalidSizes = [
          10 * 1024 * 1024 + 1, // Just over 10MB
          15 * 1024 * 1024, // 15MB
          100 * 1024 * 1024, // 100MB
        ];

        invalidSizes.forEach((size) => {
          const file = new File(['x'.repeat(size)], 'test.txt', { type: 'text/plain' });
          expect(isFileSizeValid(file)).toBe(false);
        });
      });
    });

    describe('with custom size limit', () => {
      it('should validate against custom size limit', () => {
        const customLimit = 2 * 1024 * 1024; // 2MB
        const { result } = renderHook(() => useFileSizeUtils({ maxFileSizeBytes: customLimit }));

        const validFile = new File(['x'.repeat(1024 * 1024)], 'small.txt'); // 1MB
        const invalidFile = new File(['x'.repeat(3 * 1024 * 1024)], 'large.txt'); // 3MB
        const boundaryFile = new File(['x'.repeat(customLimit)], 'boundary.txt'); // Exactly 2MB

        expect(result.current.isFileSizeValid(validFile)).toBe(true);
        expect(result.current.isFileSizeValid(invalidFile)).toBe(false);
        expect(result.current.isFileSizeValid(boundaryFile)).toBe(true); // Should be valid at exact limit
      });

      it('should handle zero size limit', () => {
        const { result } = renderHook(() => useFileSizeUtils({ maxFileSizeBytes: 0 }));

        const emptyFile = new File([], 'empty.txt');
        const nonEmptyFile = new File(['x'], 'nonempty.txt');

        expect(result.current.isFileSizeValid(emptyFile)).toBe(true); // Empty file should be valid
        expect(result.current.isFileSizeValid(nonEmptyFile)).toBe(false); // Any content should be invalid
      });
    });

    describe('with various file types', () => {
      let isFileSizeValid: (file: File) => boolean;

      beforeEach(() => {
        const { result } = renderHook(() => useFileSizeUtils());
        isFileSizeValid = result.current.isFileSizeValid;
      });

      it('should validate file size regardless of file type', () => {
        const content = 'x'.repeat(1024 * 1024); // 1MB content

        const fileTypes = [
          { type: 'text/plain', name: 'test.txt' },
          { type: 'text/csv', name: 'test.csv' },
          { type: 'image/jpeg', name: 'test.jpg' },
          { type: 'application/pdf', name: 'test.pdf' },
          { type: '', name: 'test' }, // No type
        ];

        fileTypes.forEach(({ type, name }) => {
          const file = new File([content], name, { type });
          expect(isFileSizeValid(file)).toBe(true);
        });
      });
    });
  });

  describe('memoization', () => {
    it('should memoize maxSizeMB calculation', () => {
      const props = { maxFileSizeBytes: 5 * 1024 * 1024 };
      const { result, rerender } = renderHook(({ maxFileSizeBytes }) => useFileSizeUtils({ maxFileSizeBytes }), {
        initialProps: props,
      });

      const firstMaxSizeMB = result.current.maxSizeMB;

      // Rerender with same props
      rerender(props);

      // Should return the same reference (memoized)
      expect(result.current.maxSizeMB).toBe(firstMaxSizeMB);
    });

    it('should recalculate maxSizeMB when maxFileSizeBytes changes', () => {
      const { result, rerender } = renderHook(({ maxFileSizeBytes }) => useFileSizeUtils({ maxFileSizeBytes }), {
        initialProps: { maxFileSizeBytes: 5 * 1024 * 1024 },
      });

      expect(result.current.maxSizeMB).toBe(5);

      // Change the props
      rerender({ maxFileSizeBytes: 10 * 1024 * 1024 });

      expect(result.current.maxSizeMB).toBe(10);
    });
  });

  describe('function behavior consistency', () => {
    it('should provide consistent function behavior across rerenders', () => {
      const { result, rerender } = renderHook(() => useFileSizeUtils());

      const testSize = 1024 * 1024; // 1MB
      const testFile = new File(['x'.repeat(testSize)], 'test.txt');

      // Test functions before rerender
      const firstFormatResult = result.current.formatFileSize(testSize);
      const firstValidationResult = result.current.isFileSizeValid(testFile);

      rerender();

      // Functions should produce the same results after rerender
      expect(result.current.formatFileSize(testSize)).toBe(firstFormatResult);
      expect(result.current.isFileSizeValid(testFile)).toBe(firstValidationResult);
    });

    it('should update validation behavior when props change', () => {
      const testFile = new File(['x'.repeat(5 * 1024 * 1024)], 'test.txt'); // 5MB file

      const { result, rerender } = renderHook(
        ({ maxFileSizeBytes }) => useFileSizeUtils({ maxFileSizeBytes }),
        { initialProps: { maxFileSizeBytes: 3 * 1024 * 1024 } }, // 3MB limit
      );

      // Should be invalid with 3MB limit
      expect(result.current.isFileSizeValid(testFile)).toBe(false);

      // Change to 10MB limit
      rerender({ maxFileSizeBytes: 10 * 1024 * 1024 });

      // Should now be valid with 10MB limit
      expect(result.current.isFileSizeValid(testFile)).toBe(true);
    });

    it('should maintain formatFileSize consistency regardless of props', () => {
      const testSize = 2048; // 2KB

      const { result, rerender } = renderHook(({ maxFileSizeBytes }) => useFileSizeUtils({ maxFileSizeBytes }), {
        initialProps: { maxFileSizeBytes: 5 * 1024 * 1024 },
      });

      const firstFormatResult = result.current.formatFileSize(testSize);

      // Change props
      rerender({ maxFileSizeBytes: 10 * 1024 * 1024 });

      // formatFileSize should produce the same result regardless of maxFileSizeBytes
      expect(result.current.formatFileSize(testSize)).toBe(firstFormatResult);
      expect(result.current.formatFileSize(testSize)).toBe('2KB');
    });
  });

  describe('integration scenarios', () => {
    it('should work correctly with real file objects', () => {
      const { result } = renderHook(() => useFileSizeUtils({ maxFileSizeBytes: 2 * 1024 * 1024 })); // 2MB limit

      // Create actual File objects
      const smallFile = new File(['Hello world'], 'small.txt', { type: 'text/plain' });
      const largeContent = 'x'.repeat(3 * 1024 * 1024); // 3MB
      const largeFile = new File([largeContent], 'large.csv', { type: 'text/csv' });

      // Test file size validation
      expect(result.current.isFileSizeValid(smallFile)).toBe(true);
      expect(result.current.isFileSizeValid(largeFile)).toBe(false);

      // Test file size formatting
      expect(result.current.formatFileSize(smallFile.size)).toBe('11B');
      expect(result.current.formatFileSize(largeFile.size)).toBe('3MB');

      // Test limit information
      expect(result.current.maxSizeMB).toBe(2);
      expect(result.current.maxFileSizeBytes).toBe(2 * 1024 * 1024);
    });

    it('should handle common CSV file upload scenarios', () => {
      const { result } = renderHook(() => useFileSizeUtils()); // Default 10MB limit

      // Simulate common CSV file sizes
      const csvSizes = [
        { size: 1024, description: 'small CSV' }, // 1KB
        { size: 100 * 1024, description: 'medium CSV' }, // 100KB
        { size: 1024 * 1024, description: 'large CSV' }, // 1MB
        { size: 5 * 1024 * 1024, description: 'very large CSV' }, // 5MB
        { size: 15 * 1024 * 1024, description: 'too large CSV' }, // 15MB
      ];

      csvSizes.forEach(({ size }) => {
        const file = new File(['x'.repeat(size)], 'data.csv', { type: 'text/csv' });
        const isValid = result.current.isFileSizeValid(file);
        const formattedSize = result.current.formatFileSize(file.size);

        if (size <= 10 * 1024 * 1024) {
          expect(isValid).toBe(true);
        } else {
          expect(isValid).toBe(false);
        }

        expect(typeof formattedSize).toBe('string');
        expect(formattedSize.length).toBeGreaterThan(0);
      });
    });
  });
});
