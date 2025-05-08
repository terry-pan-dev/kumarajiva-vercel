import { useRef, useEffect } from 'react';

export const useTextAreaAutoHeight = (translation: string) => {
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = textAreaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';

      const scrollHeight = textarea.scrollHeight;

      textarea.style.height = `${scrollHeight + 10}px`;
    }
  }, [translation]);

  return textAreaRef;
};
