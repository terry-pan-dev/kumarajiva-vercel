// ⚑ on a glossary translation: anyone can flag it as wrong, with a note saying why
// (docs/plans/glossary-suggestions.md). An admin then dismisses the flag, turns it into an edit,
// or removes the translation. Posts to /resources/suggestions.
import { useFetcher } from '@remix-run/react';
import { Flag } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { useToast } from '~/hooks/use-toast';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from '../ui';
import { type SuggestionResponse } from './SuggestTermDialog';

export function FlagTranslationButton({
  glossaryId,
  translationId,
  term,
}: {
  glossaryId: string;
  translationId: string;
  term: string;
}) {
  const id = useId();
  const { toast } = useToast();
  const fetcher = useFetcher<SuggestionResponse>();
  const submitting = fetcher.state !== 'idle';
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNote('');
      setError(null);
    }
  }, [open]);

  const handled = useRef<SuggestionResponse | undefined>(undefined);
  useEffect(() => {
    const data = fetcher.data;
    if (fetcher.state !== 'idle' || !data || handled.current === data) return;
    handled.current = data;
    if (data.success) {
      toast({ title: 'Flag sent', description: 'Thank you. An admin will look at it.' });
      setOpen(false);
    } else {
      setError(data.message);
    }
  }, [fetcher.state, fetcher.data, toast]);

  const send = () => {
    setError(null);
    fetcher.submit(
      { intent: 'submit', kind: 'flag', glossaryId, translationId, note },
      { method: 'post', action: '/resources/suggestions', encType: 'application/json' },
    );
  };

  return (
    <>
      <Button
        size="icon"
        type="button"
        variant="ghost"
        className="h-8 w-8 shrink-0"
        aria-label="flag-translation"
        title="Flag this translation as wrong"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <Flag className="text-muted-foreground hover:text-primary h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" onClick={(event) => event.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Flag “{term}”</DialogTitle>
            <DialogDescription>Say what is wrong with this translation. An admin will review it.</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (note.trim() && !submitting) send();
            }}
          >
            <Label className="sr-only" htmlFor={`${id}-note`}>
              What is wrong
            </Label>
            <Textarea
              rows={4}
              value={note}
              id={`${id}-note`}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. wrong source, a better rendering, a typo…"
            />
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <DialogFooter className="gap-2">
              <Button type="button" variant="secondary" disabled={submitting} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!note.trim() || submitting}>
                {submitting ? 'Sending…' : 'Send flag'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
