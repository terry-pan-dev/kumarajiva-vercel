import { Copy } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Icons } from '~/components/icons';
import { Button } from '~/components/ui';

import { WorkspaceCard } from './WorkspaceCard';

interface StreamCardProps {
  text: string;
  title: string;
  originId: string;
  sectionId: string;
  disabled: boolean;
  interrupt: boolean;
  pasteTranslation: (text: string) => void;
}

export const OpenAIStreamCard = React.memo(
  ({ text, title, originId, sectionId, disabled, pasteTranslation, interrupt }: StreamCardProps) => {
    const [translationResult, setTranslationResult] = useState<string>('');
    const [refresh, setRefresh] = useState(false);
    const [loading, setLoading] = useState(false);
    const textRef = useRef<string>('');

    // Add AbortController ref to manage request lifecycle
    const abortControllerRef = useRef<AbortController | null>(null);

    // Cleanup function to abort ongoing requests
    const cleanupStream = useCallback(() => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    }, []);

    // Cleanup on unmount or text change
    useEffect(() => {
      return () => cleanupStream();
    }, [cleanupStream]);

    useEffect(() => {
      if (interrupt) {
        abortControllerRef.current?.abort();
        setLoading(false);
      }
    }, [interrupt]);

    useEffect(() => {
      setTranslationResult('');
      textRef.current = '';

      // Clean up previous stream before starting new one
      cleanupStream();

      const fetchStream = async () => {
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined = undefined;
        try {
          // Create new AbortController for this request
          abortControllerRef.current = new AbortController();

          const req = new Request(`/openai`, {
            method: 'POST',
            body: JSON.stringify({
              origin: text,
              originId,
              // The endpoint's legacy body key; carries the section id in the
              // new data model.
              rollId: sectionId,
            }),
            // Add signal to request
            signal: abortControllerRef.current.signal,
          });

          const response = await fetch(req);
          reader = response.body?.getReader();
          const decoder = new TextDecoder();

          while (true) {
            if (!reader) break;

            const { done, value } = await reader.read();
            if (done) break;

            // Check if request was aborted
            if (abortControllerRef.current?.signal.aborted) {
              throw new Error('Stream aborted');
            }

            const chunk = decoder.decode(value);
            setTranslationResult((prev) => prev + chunk);
            textRef.current += chunk;
          }
        } catch (error) {
          console.error(`error in openai loader: ${error}`);
          if (error instanceof Error && error.name === 'AbortError') {
            console.info('Stream aborted by user');
          }
        } finally {
          if (reader) {
            reader.releaseLock();
            setLoading(false);
          }
        }
      };

      if ((refresh || text) && !disabled) {
        setLoading(true);
        abortControllerRef.current?.abort();
        fetchStream();
      }
      setRefresh(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [text, refresh, cleanupStream, disabled]);

    return (
      <>
        <WorkspaceCard
          title={title}
          text={translationResult}
          buttons={
            <>
              {loading ? <Icons.Loader className="h-4 w-4 animate-spin" /> : null}
              <Button size="icon" variant="ghost" disabled={loading} onClick={() => setRefresh(true)}>
                <Icons.Refresh className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                disabled={loading}
                onClick={() => pasteTranslation(translationResult)}
                className="transition-transform duration-300 hover:scale-110"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </>
          }
        />
      </>
    );
  },
);

OpenAIStreamCard.displayName = 'OpenAIStreamCard';
