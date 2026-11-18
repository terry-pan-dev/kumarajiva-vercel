// Sends a request to /resources/suggestions and acts on the answer once: a toast and `onSent`
// on success, the server's message in `error` otherwise. For the glossary card's small
// suggestion dialogs and the submitter's edit / withdraw controls.
import { useFetcher } from '@remix-run/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useToast } from '~/hooks/use-toast';

import { type SuggestionResponse } from './SuggestTermDialog';

type Intent = 'submit' | 'edit-own' | 'withdraw';

export function useSuggestionRequest(intent: Intent, onSent: () => void) {
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
      if (intent === 'submit') toast({ title: t('suggest.sent'), description: t('suggest.sentDescription') });
      else if (intent === 'edit-own') toast({ title: t('suggest.pending.updated') });
      else toast({ title: t('suggest.pending.withdrawn') });
      onSent();
    } else {
      setError(data.message);
    }
  }, [fetcher.state, fetcher.data, toast, onSent, t, intent]);

  const send = (request: Record<string, unknown>) => {
    setError(null);
    fetcher.submit({ intent, ...request } as never, {
      method: 'post',
      action: '/resources/suggestions',
      encType: 'application/json',
    });
  };

  const clearError = useCallback(() => setError(null), []);

  return { send, submitting: fetcher.state !== 'idle', error, clearError };
}

export function useSuggestionSubmit(onSent: () => void) {
  const { send, ...rest } = useSuggestionRequest('submit', onSent);
  return { submit: send, ...rest };
}
