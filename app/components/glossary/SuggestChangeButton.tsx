// "Suggest a change" on a stored glossary translation, the same for every role
// (docs/plans/glossary-suggestions.md). The button sits beside the rendering; the panel opens
// just below the translation, so the suggester can read what they are correcting while they
// write. One text box: what needs correcting. The glossary's translations come from published
// books, so a change is a correction (a typo, the wrong source or page, a misquoted passage); a
// different rendering is suggested as a new translation.
//
// Stored as a note-only suggestion (action `flag`). An admin then dismisses it, turns it into an
// edit in Data Management, or removes the translation.
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Label, Textarea } from '../ui';
import { useSuggestionSubmit } from './useSuggestionSubmit';

export function SuggestChangeButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation('glossary');
  return (
    <Button
      size="sm"
      type="button"
      variant="ghost"
      className="text-muted-foreground hover:text-primary h-7 shrink-0 px-2 text-xs"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {t('suggest.change.button')}
    </Button>
  );
}

// Mounted when opened and unmounted when closed, so each opening starts blank.
export function SuggestChangePanel({
  glossaryId,
  translationId,
  onDone,
}: {
  glossaryId: string;
  translationId: string;
  onDone: () => void;
}) {
  const id = useId();
  const { t } = useTranslation(['glossary', 'common']);
  const [note, setNote] = useState('');
  const { submit, submitting, error } = useSuggestionSubmit(onDone);
  const canSubmit = Boolean(note.trim()) && !submitting;

  return (
    <form
      onClick={(event) => event.stopPropagation()}
      className="border-primary/40 bg-muted/40 mt-3 flex flex-col gap-2 rounded-md border border-dashed p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) submit({ kind: 'flag', glossaryId, translationId, note });
      }}
    >
      <Label htmlFor={`${id}-note`} className="text-sm font-semibold">
        {t('suggest.change.title')}
      </Label>
      <p className="text-muted-foreground text-xs">{t('suggest.change.description')}</p>
      <Textarea
        rows={3}
        autoFocus
        value={note}
        id={`${id}-note`}
        className="bg-background"
        placeholder={t('suggest.change.placeholder')}
        onChange={(event) => setNote(event.target.value)}
      />
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" type="button" onClick={onDone} variant="secondary" disabled={submitting}>
          {t('common:actions.cancel')}
        </Button>
        <Button size="sm" type="submit" disabled={!canSubmit}>
          {submitting ? t('suggest.sending') : t('suggest.send')}
        </Button>
      </div>
    </form>
  );
}
