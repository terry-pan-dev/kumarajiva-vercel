import { useMemo } from 'react';

export interface UseFileSizeUtilsProps {
  maxFileSizeBytes?: number;
}

export const useFileSizeUtils = ({ maxFileSizeBytes = 10 * 1024 * 1024 }: UseFileSizeUtilsProps = {}) => {
  const maxSizeMB = useMemo(() => {
    return Math.round(maxFileSizeBytes / (1024 * 1024));
  }, [maxFileSizeBytes]);

  const formatFileSize = (sizeInBytes: number): string => {
    if (sizeInBytes < 1024) {
      return `${sizeInBytes}B`;
    } else if (sizeInBytes < 1024 * 1024) {
      return `${Math.round(sizeInBytes / 1024)}KB`;
    } else {
      return `${Math.round(sizeInBytes / (1024 * 1024))}MB`;
    }
  };

  const isFileSizeValid = (file: File): boolean => {
    return file.size <= maxFileSizeBytes;
  };

  return {
    maxSizeMB,
    maxFileSizeBytes,
    formatFileSize,
    isFileSizeValid,
  };
};
