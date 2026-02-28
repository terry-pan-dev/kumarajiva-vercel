import { useCallback, useEffect, useRef, useState } from 'react';

export const useTranslation = ({ originId, target }: { originId: string; target: string | undefined }) => {
  const previousOriginId = useRef<string>(originId);
  // const fetcher = useFetcher<T>();
  const [translation, setTranslation] = useState(target || '');

  const pasteTranslation = useCallback((text: string) => {
    setTranslation(text);
  }, []);

  const cleanTranslation = useCallback(() => {
    setTranslation('');
  }, []);

  const [disabledEdit, setDisabledEdit] = useState(false);

  // Be careful modifying this logic in this effect
  useEffect(() => {
    if (!translation && target) {
      setDisabledEdit(true);
    }
    if ((!translation && !target) || previousOriginId.current !== originId) {
      setDisabledEdit(false);
    }
    if (target && previousOriginId.current !== originId) {
      setTranslation(target);
    }
  }, [translation, target, originId]);

  useEffect(() => {
    previousOriginId.current = originId;
  }, [originId]);

  return {
    translation,
    pasteTranslation,
    cleanTranslation,
    disabledEdit,
  };
};
