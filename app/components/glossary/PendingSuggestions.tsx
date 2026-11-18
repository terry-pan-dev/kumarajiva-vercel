// Pending suggestions on the glossary card, the same for every role
// (docs/plans/glossary-suggestions.md, step 6). Accepted values stay the card's content; what is
// pending shows beside them in the suggestion style (a dashed border in its own hue):
// - a new translation: its proposed rendering, in a block of its own;
// - a new term (in search results): its headword and proposed translation;
// - a change to a stored translation: only a marker that it is under review, since a change
//   request is a free note, not values that could be shown in place;
// The submitter can edit or withdraw their own suggestion here. No review buttons: leaders review
// informally (user, 2026-11-18). Enriching and finalizing are in Data Management.
import { useFetcher } from '@remix-run/react';
import { Hourglass } from 'lucide-react';
import { pinyin } from 'pinyin-pro';
import { useCallback, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '~/lib/utils';
import { type PendingSuggestionView } from '~/services/suggestion.view';
import { GLOSSARY_TRANSLATION_LANGUAGES } from '~/utils/lang';
import { type ProposedTerm, type ProposedTranslation } from '~/validations/suggestion.validation';

import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from '../ui';
import { Divider } from '../ui/divider';
import { useSuggestionRequest } from './useSuggestionSubmit';

// The suggestion style, defined once (tokens in tailwind.css).
export const pendingBlockClass = 'border-suggestion/60 bg-suggestion-muted rounded-md border-2 border-dashed';

// ─── Data ────────────────────────────────────────────────────────────────────

type PendingResponse =
  | { success: true; glossaryId: string; suggestions: PendingSuggestionView[] }
  | { success: false; message: string };

// The entry's pending suggestions, loaded per card so it works wherever the card shows (the
// glossary page and the sidebar search). Remix reloads it after any suggestion request, so a new,
// edited or withdrawn suggestion shows at once.
export function usePendingSuggestions(glossaryId: string): PendingSuggestionView[] {
  const fetcher = useFetcher<PendingResponse>();
  const { load } = fetcher;
  useEffect(() => {
    load(`/resources/suggestions?glossaryId=${encodeURIComponent(glossaryId)}`);
  }, [glossaryId, load]);
  const data = fetcher.data;
  // Ignore an answer for the previously selected entry.
  return data?.success && data.glossaryId === glossaryId ? data.suggestions : [];
}

// "Show suggestions", on by default and remembered in this browser.
const SHOW_KEY = 'glossary.showSuggestions';
export function useShowSuggestions(): [boolean, (show: boolean) => void] {
  const [show, setShow] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(SHOW_KEY) === 'false') setShow(false);
    } catch {
      // No storage (private window, blocked): keep the default.
    }
  }, []);
  const update = useCallback((value: boolean) => {
    setShow(value);
    try {
      localStorage.setItem(SHOW_KEY, String(value));
    } catch {
      // As above.
    }
  }, []);
  return [show, update];
}

export function ShowSuggestionsSwitch({ show, onChange }: { show: boolean; onChange: (show: boolean) => void }) {
  const id = useId();
  const { t } = useTranslation('glossary');
  return (
    <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
      <Switch id={id} checked={show} onCheckedChange={onChange} className="data-[state=checked]:bg-suggestion" />
      <Label htmlFor={id} className="text-muted-foreground text-xs">
        {t('suggest.pending.show')}
      </Label>
    </div>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function useRelativeTime() {
  const { i18n } = useTranslation();
  return useCallback(
    (iso: string) => {
      const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
      const format = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' });
      if (Math.abs(days) < 30) return format.format(days, 'day');
      if (Math.abs(days) < 365) return format.format(Math.round(days / 30), 'month');
      return format.format(Math.round(days / 365), 'year');
    },
    [i18n.language],
  );
}

// "Under review · suggested by X, 3 days ago".
function UnderReviewLabel({ view }: { view: PendingSuggestionView }) {
  const { t } = useTranslation('glossary');
  const ago = useRelativeTime();
  return (
    <p className="text-suggestion flex items-center gap-1.5 text-xs font-medium">
      <Hourglass className="h-3.5 w-3.5 shrink-0" />
      {t('suggest.pending.underReview')}
      <span className="text-muted-foreground font-normal">
        ·{' '}
        {view.mine
          ? t('suggest.pending.byYou', { when: ago(view.createdAt) })
          : t('suggest.pending.by', { name: view.submitter, when: ago(view.createdAt) })}
      </span>
    </p>
  );
}

// The proposal's optional content, as far as it was given.
function ProposedDetails({ proposal }: { proposal: ProposedTranslation }) {
  const source = [proposal.sourceName, proposal.volume].filter(Boolean).join(' | ');
  return (
    <>
      {source && (
        <Badge variant="outline" className="mt-1 w-fit font-mono text-xs font-medium">
          {source}
        </Badge>
      )}
      {proposal.sourceText && <p className="text-muted-foreground mt-1 text-sm">{proposal.sourceText}</p>}
      {proposal.targetText && <p className="text-muted-foreground mt-1 text-sm">{proposal.targetText}</p>}
      {proposal.discussion && <p className="mt-1 text-sm whitespace-pre-wrap">{proposal.discussion}</p>}
    </>
  );
}

// The submitter's note (shown to them alone), and Edit / Withdraw while it's pending.
function OwnControls({
  view,
  renderEdit,
}: {
  view: PendingSuggestionView;
  renderEdit: (close: () => void) => React.ReactNode;
}) {
  const { t } = useTranslation(['glossary', 'common']);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const close = useCallback(() => setEditing(false), []);
  const done = useCallback(() => setConfirming(false), []);
  const withdraw = useSuggestionRequest('withdraw', done);

  if (!view.mine) return null;
  if (editing) return <>{renderEdit(close)}</>;
  return (
    <div className="mt-2 flex flex-col gap-1" onClick={(event) => event.stopPropagation()}>
      {view.note && (
        <p className="text-sm">
          <span className="text-muted-foreground text-xs font-semibold">{t('suggest.pending.yourNote')} </span>
          <span className="whitespace-pre-wrap">{view.note}</span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1">
        {view.editable && !confirming && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditing(true)}>
            {t('suggest.pending.edit')}
          </Button>
        )}
        {confirming ? (
          <>
            <span className="text-xs">{t('suggest.pending.withdrawConfirm')}</span>
            <Button
              size="sm"
              variant="destructive"
              className="h-7 px-2 text-xs"
              disabled={withdraw.submitting}
              onClick={() => withdraw.send({ id: view.id })}
            >
              {t('suggest.pending.withdraw')}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setConfirming(false)}>
              {t('common:actions.cancel')}
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setConfirming(true)}>
            {t('suggest.pending.withdraw')}
          </Button>
        )}
        {!view.editable && <span className="text-muted-foreground text-xs">{t('suggest.pending.locked')}</span>}
      </div>
      {withdraw.error && (
        <p role="alert" className="text-destructive text-sm">
          {withdraw.error}
        </p>
      )}
    </div>
  );
}

// The submitter's edit form: the note, and on a proposal its rendering and language (and the
// Chinese headword, on a new term; a changed one is checked again for uniqueness by the server).
function EditOwnForm({
  view,
  onDone,
  fields,
}: {
  view: PendingSuggestionView;
  onDone: () => void;
  // Which values the form edits besides the note; `build` turns them into the full proposal.
  fields?: {
    headword?: string;
    term: string;
    language?: string;
    build: (values: { headword?: string; term: string; language?: string }) => unknown;
  };
}) {
  const id = useId();
  const { t } = useTranslation(['glossary', 'common']);
  const [headword, setHeadword] = useState(fields?.headword);
  const [term, setTerm] = useState(fields?.term ?? '');
  const [language, setLanguage] = useState(fields?.language);
  const [note, setNote] = useState(view.note ?? '');
  const { send, submitting, error } = useSuggestionRequest('edit-own', onDone);
  // A change request is nothing but its note; a proposal needs its rendering.
  const canSubmit = !submitting && (fields ? Boolean(term.trim()) && headword?.trim() !== '' : Boolean(note.trim()));

  return (
    <form
      className="mt-2 flex flex-col gap-2"
      onClick={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        send({ id: view.id, note, ...(fields ? { proposed: fields.build({ headword, term, language }) } : {}) });
      }}
    >
      {headword !== undefined && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs" htmlFor={`${id}-headword`}>
            {t('suggest.term.chineseTerm')}
          </Label>
          <Input
            value={headword}
            id={`${id}-headword`}
            className="bg-background"
            onChange={(event) => setHeadword(event.target.value)}
          />
        </div>
      )}
      {fields && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr]">
          <div className="flex flex-col gap-1">
            <Label className="text-xs" htmlFor={`${id}-term`}>
              {t('suggest.translation')}
            </Label>
            <Input
              value={term}
              id={`${id}-term`}
              className="bg-background"
              onChange={(event) => setTerm(event.target.value)}
            />
          </div>
          {language !== undefined && (
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{t('suggest.language')}</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger aria-label={t('suggest.language')} className="bg-background capitalize">
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
          )}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <Label className="text-xs" htmlFor={`${id}-note`}>
          {t('suggest.notes')}
        </Label>
        <Textarea
          rows={3}
          value={note}
          id={`${id}-note`}
          className="bg-background"
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
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
          {submitting ? t('suggest.sending') : t('suggest.pending.save')}
        </Button>
      </div>
    </form>
  );
}

// ─── On the card ─────────────────────────────────────────────────────────────

// A suggested new translation of the entry, after its stored ones.
export function PendingTranslationBlock({ view }: { view: PendingSuggestionView }) {
  const proposal = view.proposed as ProposedTranslation | null;
  if (!proposal) return null;
  return (
    <div>
      <Divider className="text-suggestion py-1 lg:py-3">{proposal.language.toUpperCase()}</Divider>
      <div className={cn(pendingBlockClass, 'p-3')}>
        <UnderReviewLabel view={view} />
        <h2 className="text-primary mt-1 text-xl font-semibold tracking-tight lg:text-2xl">{proposal.term}</h2>
        <ProposedDetails proposal={proposal} />
        <OwnControls
          view={view}
          renderEdit={(close) => (
            <EditOwnForm
              view={view}
              onDone={close}
              fields={{
                term: proposal.term,
                language: proposal.language,
                build: ({ term, language }) => ({ ...proposal, term, language }),
              }}
            />
          )}
        />
      </div>
    </div>
  );
}

// The changes under review on one stored translation: a marker, and the submitter's own.
export function ChangesUnderReview({ views }: { views: PendingSuggestionView[] }) {
  const { t } = useTranslation('glossary');
  if (!views.length) return null;
  const mine = views.filter((view) => view.mine);
  return (
    <div className={cn(pendingBlockClass, 'mt-2 px-3 py-2')}>
      <p className="text-suggestion flex items-center gap-1.5 text-xs font-medium">
        <Hourglass className="h-3.5 w-3.5 shrink-0" />
        {t('suggest.pending.changeUnderReview', { count: views.length })}
      </p>
      {mine.map((view) => (
        <OwnControls view={view} key={view.id} renderEdit={(close) => <EditOwnForm view={view} onDone={close} />} />
      ))}
    </div>
  );
}

// ─── New terms, in search results ────────────────────────────────────────────

export function ProposedTermItem({ view }: { view: PendingSuggestionView }) {
  const { t } = useTranslation('glossary');
  const proposal = view.proposed as ProposedTerm | null;
  if (!proposal) return null;
  return (
    <Card
      className={cn(pendingBlockClass, 'w-full cursor-pointer transition-all duration-300 ease-in-out hover:shadow-md')}
    >
      <CardContent className="p-4 sm:p-6">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-primary truncate text-lg font-semibold sm:text-xl">{proposal.sourceTerm}</h3>
          <Badge variant="outline" className="border-suggestion text-suggestion">
            {t('suggest.pending.proposed')}
          </Badge>
        </div>
        <p className="text-muted-foreground line-clamp-2 text-sm">{proposal.translation.term}</p>
      </CardContent>
    </Card>
  );
}

export function ProposedTermDetail({ view }: { view: PendingSuggestionView }) {
  const { t } = useTranslation('glossary');
  const proposal = view.proposed as ProposedTerm | null;
  if (!proposal) return null;
  const translation = proposal.translation;
  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex-grow px-4 pt-4">
        <div className="my-2 flex flex-wrap items-end gap-2">
          <h2 className="text-primary text-xl font-semibold tracking-tight lg:text-3xl">{proposal.sourceTerm}</h2>
          {proposal.phonetic && <h2 className="text-md text-secondary-foreground font-mono">({proposal.phonetic})</h2>}
          <Badge variant="outline" className="border-suggestion text-suggestion">
            {t('suggest.pending.proposed')}
          </Badge>
        </div>
        <p className="text-muted-foreground text-sm">{t('suggest.pending.proposedDescription')}</p>
        <Divider className="text-suggestion py-1 lg:py-3">{translation.language.toUpperCase()}</Divider>
        <div className={cn(pendingBlockClass, 'p-3')}>
          <UnderReviewLabel view={view} />
          <h2 className="text-primary mt-1 text-xl font-semibold tracking-tight lg:text-2xl">{translation.term}</h2>
          <ProposedDetails proposal={translation} />
          <OwnControls
            view={view}
            renderEdit={(close) => (
              <EditOwnForm
                view={view}
                onDone={close}
                fields={{
                  headword: proposal.sourceTerm,
                  term: translation.term,
                  language: translation.language,
                  build: ({ headword, term, language }) => ({
                    ...proposal,
                    // A new headword gets its pinyin filled in again, as in "Suggest a term".
                    ...(headword && headword.trim() !== proposal.sourceTerm
                      ? { sourceTerm: headword.trim(), phonetic: pinyin(headword.trim()) }
                      : {}),
                    translation: { ...translation, term, language },
                  }),
                }}
              />
            )}
          />
        </div>
      </CardContent>
    </Card>
  );
}
