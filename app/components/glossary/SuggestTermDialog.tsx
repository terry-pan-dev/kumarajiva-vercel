// "Suggest a term": the small form anyone can use to propose a glossary entry
// (docs/plans/glossary-suggestions.md). It asks for the term, a translation and a free note;
// opened from a paragraph of the translation page, it also offers what it knows from there (the
// document and page, the source and translation passages), each of which can be left off.
//
// It posts to /resources/suggestions. If the term is already in the glossary, it offers to send
// the same suggestion as a new translation of that entry instead.
import { useFetcher } from '@remix-run/react';
import { pinyin } from 'pinyin-pro';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useToast } from '~/hooks/use-toast';
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

// Where the suggestion was made, when it comes from a paragraph of the translation page.
export type SuggestPassage = {
  projectId?: string;
  documentId?: string;
  sectionId?: string;
  paragraphId?: string;
  documentTitle?: string;
  page?: string | null;
  originText?: string | null;
  targetText?: string | null;
};

export type SuggestTermInitial = { selection?: string; passage?: SuggestPassage };

// What /resources/suggestions answers.
export type SuggestionResponse =
  | { success: true; suggestion: { id: string } }
  | { success: false; code: string; message: string; glossaryId?: string; fields?: string[] };

// Not lib/utils' chineseRegex: that one is global, so .test() on it is stateful.
const hasChinese = (text: string) => /[一-龥]/.test(text);

// Keys with no value left out: the endpoint's context schema takes strings, not nulls.
const compact = (object: Record<string, string | null | undefined>) =>
  Object.fromEntries(Object.entries(object).filter((entry): entry is [string, string] => Boolean(entry[1])));

const clip = (text: string, length = 120) => (text.length > length ? `${text.slice(0, length)}…` : text);

export function SuggestTermDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: SuggestTermInitial;
}) {
  const id = useId();
  const { t } = useTranslation(['glossary', 'common']);
  const { toast } = useToast();
  const fetcher = useFetcher<SuggestionResponse>();
  const submitting = fetcher.state !== 'idle';
  const passage = initial?.passage;

  const [sourceTerm, setSourceTerm] = useState('');
  const [phonetic, setPhonetic] = useState('');
  const [term, setTerm] = useState('');
  const [language, setLanguage] = useState<string>(DEFAULT_TARGET_LANG);
  const [note, setNote] = useState('');
  const [attachSource, setAttachSource] = useState(true);
  const [attachOrigin, setAttachOrigin] = useState(true);
  const [attachTarget, setAttachTarget] = useState(true);
  const [existing, setExisting] = useState<{ glossaryId: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Each opening starts afresh from what it was opened with. A selection in Chinese is the term;
  // anything else is taken as the translation.
  useEffect(() => {
    if (!open) return;
    const selection = initial?.selection?.trim() ?? '';
    const chinese = hasChinese(selection);
    setSourceTerm(chinese ? selection : '');
    setPhonetic(chinese ? pinyin(selection) : '');
    setTerm(chinese ? '' : selection);
    setLanguage(DEFAULT_TARGET_LANG);
    setNote('');
    setAttachSource(true);
    setAttachOrigin(true);
    setAttachTarget(true);
    setExisting(null);
    setError(null);
  }, [open, initial]);

  // Acts on each answer once.
  const handled = useRef<SuggestionResponse | undefined>(undefined);
  useEffect(() => {
    const data = fetcher.data;
    if (fetcher.state !== 'idle' || !data || handled.current === data) return;
    handled.current = data;
    if (data.success) {
      toast({ title: t('suggest.sent'), description: t('suggest.sentDescription') });
      onOpenChange(false);
    } else if (data.code === 'term-exists' && data.glossaryId) {
      setExisting({ glossaryId: data.glossaryId, message: data.message });
    } else {
      setError(data.message);
    }
  }, [fetcher.state, fetcher.data, toast, onOpenChange, t]);

  const translation = {
    term: term.trim(),
    language,
    sourceName: passage && attachSource ? (passage.documentTitle ?? null) : null,
    volume: passage && attachSource ? (passage.page ?? null) : null,
    sourceText: passage && attachOrigin ? (passage.originText ?? null) : null,
    targetText: passage && attachTarget ? (passage.targetText ?? null) : null,
  };
  const context = passage
    ? compact({
        projectId: passage.projectId,
        documentId: passage.documentId,
        sectionId: passage.sectionId,
        paragraphId: passage.paragraphId,
        page: passage.page,
      })
    : undefined;

  const send = (payload: Record<string, unknown>) => {
    setError(null);
    fetcher.submit({ intent: 'submit', note, ...(context ? { context } : {}), ...payload } as never, {
      method: 'post',
      action: '/resources/suggestions',
      encType: 'application/json',
    });
  };

  const submitTerm = () => {
    setExisting(null);
    send({
      kind: 'new-term',
      proposed: { sourceTerm: sourceTerm.trim(), phonetic: phonetic.trim() || null, translation },
    });
  };

  const submitAsTranslation = (glossaryId: string) =>
    send({ kind: 'new-translation', glossaryId, proposed: translation });

  const fillPhonetic = () => {
    if (sourceTerm.trim() && !phonetic.trim()) setPhonetic(pinyin(sourceTerm.trim()));
  };

  const canSubmit = Boolean(sourceTerm.trim() && term.trim()) && !submitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('suggest.term.title')}</DialogTitle>
          <DialogDescription>{t('suggest.term.description')}</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) submitTerm();
          }}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-source`}>{t('suggest.term.chineseTerm')}</Label>
              <Input
                value={sourceTerm}
                id={`${id}-source`}
                onBlur={fillPhonetic}
                onChange={(event) => {
                  setSourceTerm(event.target.value);
                  setExisting(null);
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-phonetic`} className="text-muted-foreground">
                {t('suggest.term.pinyin')}
              </Label>
              <Input value={phonetic} id={`${id}-phonetic`} onChange={(event) => setPhonetic(event.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-term`}>{t('suggest.translation')}</Label>
              <Input value={term} id={`${id}-term`} onChange={(event) => setTerm(event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-muted-foreground">{t('suggest.language')}</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger aria-label={t('suggest.language')}>
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

          {passage && (
            <fieldset className="border-border flex flex-col gap-2 rounded-md border p-3 text-sm">
              <legend className="text-muted-foreground px-1 text-xs font-medium uppercase">
                {t('suggest.term.fromPassage')}
              </legend>
              {passage.documentTitle && (
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={attachSource}
                    onChange={(event) => setAttachSource(event.target.checked)}
                  />
                  <span>
                    {t('suggest.term.recordSource', {
                      source: [passage.documentTitle, passage.page && t('suggest.term.page', { page: passage.page })]
                        .filter(Boolean)
                        .join(' · '),
                    })}
                  </span>
                </label>
              )}
              {passage.originText && (
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={attachOrigin}
                    onChange={(event) => setAttachOrigin(event.target.checked)}
                  />
                  <span>
                    {t('suggest.term.attachOrigin')}{' '}
                    <span className="text-muted-foreground">“{clip(passage.originText)}”</span>
                  </span>
                </label>
              )}
              {passage.targetText && (
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={attachTarget}
                    onChange={(event) => setAttachTarget(event.target.checked)}
                  />
                  <span>
                    {t('suggest.term.attachTarget')}{' '}
                    <span className="text-muted-foreground">“{clip(passage.targetText)}”</span>
                  </span>
                </label>
              )}
            </fieldset>
          )}

          {existing && (
            <div role="status" className="bg-muted flex flex-col gap-2 rounded-md p-3 text-sm">
              <p>{existing.message}</p>
              <Button
                type="button"
                variant="secondary"
                disabled={!term.trim() || submitting}
                onClick={() => submitAsTranslation(existing.glossaryId)}
              >
                {t('suggest.term.asTranslation')}
              </Button>
            </div>
          )}
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="secondary" disabled={submitting} onClick={() => onOpenChange(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? t('suggest.sending') : t('suggest.send')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
