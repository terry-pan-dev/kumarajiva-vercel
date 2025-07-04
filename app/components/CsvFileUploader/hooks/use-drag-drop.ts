import { useCallback, useState } from 'react';

export interface UseDragDropProps {
  onFileDrop: (file: File) => void;
  acceptMultiple?: boolean;
  acceptedExtensions?: string[];
}

export const useDragDrop = ({
  onFileDrop,
  acceptMultiple = false,
  acceptedExtensions = ['.csv'],
}: UseDragDropProps) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);

      if (!acceptMultiple && files.length > 1) {
        return;
      }

      const validFile = files.find((file) =>
        acceptedExtensions.some((ext) => file.name.toLowerCase().endsWith(ext.toLowerCase())),
      );

      if (validFile) {
        onFileDrop(validFile);
      }
    },
    [onFileDrop, acceptMultiple, acceptedExtensions],
  );

  const dragDropProps = {
    onDrop: handleDrop,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
  };

  return {
    isDragOver,
    dragDropProps,
  };
};
