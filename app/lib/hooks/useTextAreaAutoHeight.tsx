import { useCallback, useRef, useLayoutEffect } from 'react';

export const useTextAreaAutoHeight = (value: string) => {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const setRef = useCallback((el: HTMLTextAreaElement | null) => {
    ref.current = el;
    if (!el) return;

    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 10}px`;
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 10}px`;
  }, [value]);

  return setRef;
};
