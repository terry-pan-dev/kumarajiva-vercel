// One suggestion in the Data Management queue (docs/plans/glossary-suggestions.md, step 7): what
// was suggested and by whom, the entry it is about, and the work on it.
// - Enrich (everyone who sees the queue: tech, admin): the step 4 translation fields, filled from
//   the proposal; on a new term the Chinese headword too. "Mark ready" is information only.
// - Finalize (admin): accept or reject; merge a new term into the entry that has its headword;
//   for a change request, dismiss it, turn it into an edit, or remove the translation.
import { Link, useFetcher } from '@remix-run/react';
import { type SerializeFrom } from '@vercel/remix';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormInput } from '~/components/FormModal';
import { TranslationFields } from '~/components/GlossaryForm';
import { Badge, Button, Label, Switch, Textarea } from '~/components/ui';
import { Divider } from '~/components/ui/divider';
import { useToast } from '~/hooks/use-toast';
import { type loader, type QueueActionResult } from '~/routes/_app.data.glossary.editor.suggestions';
import { type FieldComparison } from '~/services/suggestion.view';
import { type QueueIntent } from '~/validations/suggestion.validation';

type Detail = NonNullable<SerializeFrom<typeof loader>['selected']>;
type Values = Record<string, unknown>;

// A translation's content fields, in display order.
const FIELDS = [
  'term',
  'language',
  'sourceName',
  'volume',
  'author',
  'partOfSpeech',
  'phonetic',
  'sourceText',
  'targetText',
  'discussion',
] as const;

// Form values: every field, blank for null.
const toForm = (values: Values | null | undefined) =>
  Object.fromEntries(FIELDS.map((field) => [field, (values?.[field] as string | null | undefined) ?? '']));

// An edit: the fields whose value differs from `from` (language never changes on a stored
// translation). Blank is sent as '' and means "clear it".
const editFrom = (values: Values, from: Values) =>
  Object.fromEntries(
    FIELDS.filter((field) => field !== 'language')
      .filter((field) => ((values[field] as string) || null) !== ((from[field] as string) || null))
      .map((field) => [field, values[field]]),
  );

// ─── Sending ─────────────────────────────────────────────────────────────────

function useQueueAction() {
  const { t } = useTranslation('common');
  const { toast } = useToast();
  const fetcher = useFetcher<QueueActionResult>();
  const [result, setResult] = useState<QueueActionResult | null>(null);
  const handled = useRef<QueueActionResult | undefined>(undefined);
  useEffect(() => {
    const data = fetcher.data;
    if (fetcher.state !== 'idle' || !data || handled.current === data) return;
    handled.current = data;
    setResult(data);
    toast({
      variant: data.success ? 'default' : 'error',
      title: data.success ? t('toast.done') : t('toast.oops'),
      description: data.success ? data.message : data.error,
      position: 'top-right',
    });
  }, [fetcher.state, fetcher.data, toast, t]);
  const send = useCallback(
    (intent: QueueIntent, body: Record<string, unknown>) => {
      setResult(null);
      fetcher.submit({ intent, ...body } as never, { method: 'post', encType: 'application/json' });
    },
    [fetcher],
  );
  return { send, busy: fetcher.state !== 'idle', result };
}

// ─── The panel ───────────────────────────────────────────────────────────────

export function SuggestionQueueDetail({ detail, canFinalize }: { detail: Detail; canFinalize: boolean }) {
  const { t } = useTranslation('glossary');
  const { suggestion, kind, entry, translation } = detail;
  const pending = suggestion.status === 'pending';
  const context = suggestion.context as { projectId?: string; sectionId?: string; page?: string } | null;
  const enriched = Boolean(suggestion.enrichedAt);
  const headword =
    kind === 'new-term'
      ? ((suggestion.proposed as { sourceTerm?: string } | null)?.sourceTerm ?? '')
      : (entry?.sourceTerm ?? null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-primary text-2xl font-semibold">{headword ?? t('queue.targetGone')}</h2>
        <Badge variant="secondary">{t(`queue.kind.${kind}`)}</Badge>
        <Badge variant={pending ? 'outline' : 'default'}>{t(`queue.status.${suggestion.status}`)}</Badge>
        {entry && (
          <Link className="text-primary ml-auto text-sm underline" to={`/data/glossary/editor/entries?id=${entry.id}`}>
            {t('queue.openEntry')}
          </Link>
        )}
      </div>

      <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt>{t('queue.meta.submitted')}</dt>
        <dd>
          {detail.submitter} · {new Date(suggestion.createdAt).toLocaleString()}
        </dd>
        {context?.projectId && context.sectionId && (
          <>
            <dt>{t('queue.meta.from')}</dt>
            <dd>
              <a
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
                href={`/translation/${context.projectId}/${context.sectionId}`}
              >
                {t('queue.meta.openSection')}
              </a>
              {context.page && ` · ${t('suggest.term.page', { page: context.page })}`}
            </dd>
          </>
        )}
        {enriched && (
          <>
            <dt>{t('queue.meta.enriched')}</dt>
            <dd>
              {detail.enrichedBy} · {new Date(suggestion.enrichedAt!).toLocaleString()}
            </dd>
          </>
        )}
        {suggestion.readyAt && (
          <>
            <dt>{t('queue.meta.ready')}</dt>
            <dd>
              {detail.readyBy} · {new Date(suggestion.readyAt).toLocaleString()}
            </dd>
          </>
        )}
        {suggestion.decidedAt && (
          <>
            <dt>{t('queue.meta.decided')}</dt>
            <dd>
              {detail.decidedBy} · {new Date(suggestion.decidedAt).toLocaleString()}
              {suggestion.decisionNote && <span className="block whitespace-pre-wrap">{suggestion.decisionNote}</span>}
            </dd>
          </>
        )}
      </dl>

      {suggestion.note && (
        <div className="border-primary/40 border-l-2 pl-3">
          <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {kind === 'change-request' ? t('queue.request') : t('queue.submitterNote')}
          </span>
          <p className="text-sm whitespace-pre-wrap">{suggestion.note}</p>
        </div>
      )}

      {(kind === 'change-request' || kind === 'edit') && (
        <StoredTranslation translation={translation} comparison={detail.comparison} />
      )}
      {kind === 'new-translation' && entry && (
        <p className="text-muted-foreground text-sm">
          {t('queue.existingTranslations')}{' '}
          {entry.translations.map((existing) => `${existing.term} (${existing.language})`).join(' · ') || '—'}
        </p>
      )}

      {pending && kind !== 'change-request' && <EnrichForm detail={detail} />}
      {pending && kind === 'change-request' && canFinalize && translation && <FlagToEditForm detail={detail} />}
      {!pending && kind !== 'change-request' && <Values values={proposalValues(detail)} />}

      {enriched && kind !== 'change-request' && (
        <details className="text-sm">
          <summary className="text-muted-foreground cursor-pointer">{t('queue.asSubmitted')}</summary>
          <Values values={proposalValues(detail, 'submitted')} />
        </details>
      )}

      {pending && <ReadyToggle detail={detail} />}
      {pending && canFinalize && <FinalizePanel detail={detail} />}
    </div>
  );
}

// ─── Values ──────────────────────────────────────────────────────────────────

// The proposal (or what was submitted) as label → value, for read-only display.
const proposalValues = (detail: Detail, which: 'proposed' | 'submitted' = 'proposed'): [string, string][] => {
  const value = (detail.suggestion[which] ?? {}) as Values;
  const translation = detail.kind === 'new-term' ? ((value.translation ?? {}) as Values) : value;
  const head: [string, unknown][] =
    detail.kind === 'new-term'
      ? [
          ['sourceTerm', value.sourceTerm],
          ['phonetic (term)', value.phonetic],
          ['cbetaFrequency', value.cbetaFrequency],
        ]
      : [];
  return [...head, ...FIELDS.map((field) => [field, translation[field]] as [string, unknown])].flatMap(([label, v]) =>
    typeof v === 'string' && v !== '' ? [[label, v] as [string, string]] : [],
  );
};

function Values({ values }: { values: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      {values.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground font-mono text-xs leading-5">{label}</dt>
          <dd className="whitespace-pre-wrap">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// The stored translation a change request or edit is about, and an edit's comparison.
function StoredTranslation({
  translation,
  comparison,
}: {
  translation: Detail['translation'];
  comparison: FieldComparison[] | null;
}) {
  const { t } = useTranslation('glossary');
  if (!translation) return <p className="text-destructive text-sm">{t('queue.translationGone')}</p>;
  return (
    <div className="flex flex-col gap-2">
      <Divider>{t('queue.stored', { language: translation.language.toUpperCase() })}</Divider>
      {comparison ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground text-left text-xs">
              <th className="py-1 pr-2 font-medium">{t('queue.compare.field')}</th>
              <th className="py-1 pr-2 font-medium">{t('queue.compare.base')}</th>
              <th className="py-1 pr-2 font-medium">{t('queue.compare.current')}</th>
              <th className="py-1 font-medium">{t('queue.compare.proposed')}</th>
            </tr>
          </thead>
          <tbody>
            {comparison.map((row) => (
              <tr key={row.field} className="border-t align-top">
                <td className="py-1 pr-2 font-mono text-xs">{row.field}</td>
                <td className="text-muted-foreground py-1 pr-2 line-through">{row.base ?? '—'}</td>
                <td className={`py-1 pr-2 ${row.stale ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                  {row.current ?? '—'}
                  {row.stale && <span className="block text-xs">{t('queue.compare.changedSince')}</span>}
                </td>
                <td className="py-1">{row.proposed ?? t('queue.compare.cleared')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Values
          values={FIELDS.flatMap((field) => {
            const value = (translation as Values)[field];
            return typeof value === 'string' && value !== '' ? [[field, value] as [string, string]] : [];
          })}
        />
      )}
    </div>
  );
}

// ─── Enriching ───────────────────────────────────────────────────────────────

// The proposal, editable. Saving replaces it (the submitter's version stays as submitted).
function EnrichForm({ detail }: { detail: Detail }) {
  const { t } = useTranslation('glossary');
  const { send, busy } = useQueueAction();
  const { kind, suggestion } = detail;
  const proposed = (suggestion.proposed ?? {}) as Values;
  const base = (suggestion.base ?? {}) as Values;

  const defaults =
    kind === 'new-term'
      ? {
          sourceTerm: proposed.sourceTerm ?? '',
          phonetic: proposed.phonetic ?? '',
          cbetaFrequency: proposed.cbetaFrequency ?? '',
          translation: toForm(proposed.translation as Values),
        }
      : kind === 'edit'
        ? // An edit is shown as the translation it would produce.
          toForm({ ...base, ...proposed })
        : toForm(proposed);
  const form = useForm<Values>({ defaultValues: defaults });

  const submit = (values: Values) => {
    const next = kind === 'edit' ? editFrom(values, base) : values;
    send('enrich', { id: suggestion.id, proposed: next });
  };

  return (
    <FormProvider {...form}>
      <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(submit)}>
        <Divider>{t('queue.enrich')}</Divider>
        {kind === 'new-term' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormInput required label="Term" name="sourceTerm" description={t('queue.headwordHint')} />
            <FormInput name="phonetic" label="Phonetic" description="The phonetic of the term" />
            <FormInput name="cbetaFrequency" label="CBETA Frequency" description="The CBETA frequency of the term" />
          </div>
        )}
        <TranslationFields isNew={kind !== 'edit'} prefix={kind === 'new-term' ? 'translation' : ''} />
        <div className="flex justify-end gap-2">
          <Button type="button" disabled={busy} variant="secondary" onClick={() => form.reset(defaults)}>
            {t('queue.reset')}
          </Button>
          <Button type="submit" disabled={busy}>
            {t('queue.saveEnrichment')}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}

// A change request turned into an edit of the stored translation (admin). It stays pending, to
// be accepted as an edit.
function FlagToEditForm({ detail }: { detail: Detail }) {
  const { t } = useTranslation('glossary');
  const [open, setOpen] = useState(false);
  const { send, busy } = useQueueAction();
  const current = (detail.translation ?? {}) as Values;
  const defaults = toForm(current);
  const form = useForm<Values>({ defaultValues: defaults });

  if (!open) {
    return (
      <div>
        <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
          {t('queue.flagToEdit')}
        </Button>
      </div>
    );
  }
  return (
    <FormProvider {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) =>
          send('flag-to-edit', { id: detail.suggestion.id, proposed: editFrom(values, current) }),
        )}
      >
        <Divider>{t('queue.flagToEdit')}</Divider>
        <p className="text-muted-foreground text-sm">{t('queue.flagToEditHint')}</p>
        <TranslationFields prefix="" isNew={false} />
        <div className="flex justify-end gap-2">
          <Button type="button" disabled={busy} variant="secondary" onClick={() => setOpen(false)}>
            {t('queue.cancel')}
          </Button>
          <Button type="submit" disabled={busy}>
            {t('queue.saveAsEdit')}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}

function ReadyToggle({ detail }: { detail: Detail }) {
  const { t } = useTranslation('glossary');
  const { send, busy } = useQueueAction();
  const id = `ready-${detail.suggestion.id}`;
  return (
    <div className="flex items-center gap-2">
      <Switch
        id={id}
        disabled={busy}
        checked={Boolean(detail.suggestion.readyAt)}
        onCheckedChange={(ready) => send('ready', { id: detail.suggestion.id, ready })}
      />
      <Label htmlFor={id}>{t('queue.markReady')}</Label>
      <span className="text-muted-foreground text-xs">{t('queue.markReadyHint')}</span>
    </div>
  );
}

// ─── Finalizing (admin) ──────────────────────────────────────────────────────

function FinalizePanel({ detail }: { detail: Detail }) {
  const { t } = useTranslation('glossary');
  const { send, busy, result } = useQueueAction();
  const [note, setNote] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const id = detail.suggestion.id;
  const failed = result && !result.success ? result : null;
  const stale = failed?.intent === 'accept' && failed.code === 'stale' ? (failed.fields ?? []) : null;
  const existingId = failed?.code === 'term-exists' ? failed.glossaryId : undefined;

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <Divider>{t('queue.finalize')}</Divider>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`note-${id}`}>{t('queue.decisionNote')}</Label>
        <Textarea rows={2} value={note} id={`note-${id}`} onChange={(event) => setNote(event.target.value)} />
      </div>

      {stale && (
        <div role="alert" className="border-destructive/50 rounded-md border p-2 text-sm">
          <p>{t('queue.staleWarning', { fields: stale.join(', ') })}</p>
          <Button
            size="sm"
            disabled={busy}
            className="mt-2"
            variant="destructive"
            onClick={() => send('accept', { id, note, confirmStale: true })}
          >
            {t('queue.acceptAnyway')}
          </Button>
        </div>
      )}
      {existingId && detail.kind === 'new-term' && (
        <div role="alert" className="rounded-md border p-2 text-sm">
          <p>{t('queue.termExists')}</p>
          <Button
            size="sm"
            disabled={busy}
            className="mt-2"
            onClick={() => send('merge', { id, glossaryId: existingId })}
          >
            {t('queue.merge')}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {detail.kind === 'change-request' ? (
          <>
            {confirmRemove ? (
              <>
                <span className="self-center text-sm">{t('queue.removeConfirm')}</span>
                <Button variant="ghost" disabled={busy} onClick={() => setConfirmRemove(false)}>
                  {t('queue.cancel')}
                </Button>
                <Button disabled={busy} variant="destructive" onClick={() => send('remove-translation', { id, note })}>
                  {t('queue.removeTranslation')}
                </Button>
              </>
            ) : (
              <Button variant="outline" disabled={busy || !detail.translation} onClick={() => setConfirmRemove(true)}>
                {t('queue.removeTranslation')}
              </Button>
            )}
            <Button disabled={busy} variant="secondary" onClick={() => send('dismiss', { id, note })}>
              {t('queue.dismiss')}
            </Button>
          </>
        ) : (
          <>
            <Button disabled={busy} variant="secondary" onClick={() => send('reject', { id, note })}>
              {t('queue.reject')}
            </Button>
            <Button disabled={busy} onClick={() => send('accept', { id, note })}>
              {t('queue.accept')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
