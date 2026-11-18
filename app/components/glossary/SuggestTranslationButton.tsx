// "Suggest a translation" on a glossary entry, the same for every role
// (docs/plans/glossary-suggestions.md): the rendering, its language and a note, nothing more.
// The team fills in the rest (source, passages, discussion) in Data Management.
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DEFAULT_TARGET_LANG } from '~/utils/constants';
import { GLOSSARY_TRANSLATION_LANGUAGES } from '~/utils/lang';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '../ui';
import { useSuggestionSubmit } from './useSuggestionSubmit';

export function SuggestTranslationButton({ glossaryId, sourceTerm }: { glossaryId: string; sourceTerm: string }) {
  const id = useId();
  const { t } = useTranslation(['glossary', 'common']);
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [language, setLanguage] = useState<string>(DEFAULT_TARGET_LANG);
  const [note, setNote] = useState('');
  const close = useCallback(() => setOpen(false), []);
  const { submit, submitting, error, clearError } = useSuggestionSubmit(close);

  useEffect(() => {
    if (!open) return;
    setTerm('');
    setLanguage(DEFAULT_TARGET_LANG);
    setNote('');
    clearError();
  }, [open, clearError]);

  const canSubmit = Boolean(term.trim()) && !submitting;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="text-muted-foreground hover:text-primary"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <Plus className="mr-1 h-4 w-4" />
        {t('suggest.newTranslation.button')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" onClick={(event) => event.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{t('suggest.newTranslation.title', { term: sourceTerm })}</DialogTitle>
            <DialogDescription>{t('suggest.newTranslation.description')}</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSubmit) submit({ kind: 'new-translation', glossaryId, note, proposed: { term, language } });
            }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-term`}>{t('suggest.translation')}</Label>
                <Input value={term} id={`${id}-term`} onChange={(event) => setTerm(event.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-muted-foreground">{t('suggest.language')}</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="capitalize" aria-label={t('suggest.language')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GLOSSARY_TRANSLATION_LANGUAGES.map((value) => (
                      <SelectItem key={value} value={value} className="capitalize">
                        {t(`common:languages.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-note`}>{t('suggest.notes')}</Label>
              <Textarea
                rows={3}
                value={note}
                id={`${id}-note`}
                placeholder={t('suggest.notePrompt')}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <DialogFooter className="gap-2">
              <Button type="button" onClick={close} variant="secondary" disabled={submitting}>
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {submitting ? t('suggest.sending') : t('suggest.send')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
