import { useFetcher } from '@remix-run/react';
import { useCallback, useEffect, useState } from 'react';

export const useTranslation = <T,>(target: string | null) => {
  const fetcher = useFetcher<T>();
  const [translation, setTranslation] = useState(target || '');

  const pasteTranslation = useCallback((text: string) => {
    setTranslation(text);
  }, []);

  const cleanTranslation = useCallback(() => {
    setTranslation('');
  }, []);

  const isLoading = fetcher.state === 'submitting' || fetcher.state === 'loading';

  const [disabledEdit, setDisabledEdit] = useState(false);

  useEffect(() => {
    if (!translation && target) {
      setDisabledEdit(true);
    }
    if (!translation && !target) {
      setDisabledEdit(false);
    }
  }, [translation, target]);

  return {
    translation,
    pasteTranslation,
    cleanTranslation,
    isLoading,
    disabledEdit,
    fetcher,
  };
};
