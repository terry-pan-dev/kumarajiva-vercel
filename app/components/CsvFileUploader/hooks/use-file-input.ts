import { useCallback, useRef } from 'react';

export interface UseFileInputProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  multiple?: boolean;
}

export const useFileInput = ({ onFileSelect, accept = '.csv', multiple = false }: UseFileInputProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        onFileSelect(file);
      }
    },
    [onFileSelect],
  );

  const triggerFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const clearFileInput = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const fileInputProps = {
    type: 'file' as const,
    accept,
    multiple,
    ref: fileInputRef,
    className: 'hidden',
    onChange: handleFileSelect,
  };

  return {
    fileInputRef,
    fileInputProps,
    triggerFileSelect,
    clearFileInput,
  };
};
