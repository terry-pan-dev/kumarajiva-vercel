// Sends a suggestion to /resources/suggestions and acts on the answer once: a toast and
// `onSent` on success, the server's message in `error` otherwise. For the small suggestion
// dialogs of the glossary card.
import { useFetcher } from '@remix-run/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useToast } from '~/hooks/use-toast';

import { type SuggestionResponse } from './SuggestTermDialog';

export function useSuggestionSubmit(onSent: () => void) {
  const { toast } = useToast();
  const { t } = useTranslation('glossary');
  const fetcher = useFetcher<SuggestionResponse>();
  const [error, setError] = useState<string | null>(null);

  const handled = useRef<SuggestionResponse | undefined>(undefined);
  useEffect(() => {
    const data = fetcher.data;
    if (fetcher.state !== 'idle' || !data || handled.current === data) return;
    handled.current = data;
    if (data.success) {
      toast({ title: t('suggest.sent'), description: t('suggest.sentDescription') });
      onSent();
    } else {
      setError(data.message);
    }
  }, [fetcher.state, fetcher.data, toast, onSent, t]);

  const submit = (request: Record<string, unknown>) => {
    setError(null);
    fetcher.submit({ intent: 'submit', ...request } as never, {
      method: 'post',
      action: '/resources/suggestions',
      encType: 'application/json',
    });
  };

  const clearError = useCallback(() => setError(null), []);

  return { submit, submitting: fetcher.state !== 'idle', error, clearError };
}
