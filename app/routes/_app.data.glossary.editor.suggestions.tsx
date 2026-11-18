// Glossary suggestions queue, in Data Management (docs/plans/glossary-suggestions.md, step 7).
//
// Where suggestions made on the glossary page are worked on:
// - enrich (tech, admin: GlossaryData Maintain): fill in a proposal's missing fields, mark it
//   ready;
// - finalize (admin: Glossary Administrate): accept, reject, merge a new term into an existing
//   entry; for a change request, dismiss it, turn it into an edit, or remove the translation.
// Leaders review informally, so there are no review columns or controls here.
//
// The page lists the queue (pending, oldest first, by default) and shows one suggestion (`?id=`).
// Every write goes through suggestion.service, which holds the rules; a SuggestionError comes back
// with its message and code (and `glossaryId` for 'term-exists', `fields` for 'stale').
import { Link, useLoaderData, useRouteError, useSearchParams } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { useTranslation } from 'react-i18next';

import { assertAuthUser } from '~/auth.server';
import { ErrorInfo } from '~/components/ErrorInfo';
import { SuggestionQueueDetail } from '~/components/glossary/SuggestionQueueDetail';
import {
  Badge,
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '~/components/ui';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { getFixedT } from '~/i18n/locale.server';
import { readGlossariesByIds } from '~/services/glossary.service';
import { canEnrich, canFinalize, SUGGESTION_ERROR_STATUS, SuggestionError } from '~/services/suggestion.rules';
import {
  acceptSuggestion,
  dismissFlag,
  enrichSuggestion,
  flagToEdit,
  listSuggestionQueue,
  mergeIntoTerm,
  readSuggestionForQueue,
  rejectSuggestion,
  removeFlaggedTranslation,
  setSuggestionReady,
} from '~/services/suggestion.service';
import { SUGGESTION_KINDS, type SuggestionKind } from '~/services/suggestion.view';
import { SUGGESTION_STATUS_VALUES, type SuggestionStatus } from '~/utils/constants';
import { queueRequestSchema, type QueueIntent } from '~/validations/suggestion.validation';

export function ErrorBoundary() {
  const error = useRouteError();
  return <ErrorInfo error={error} />;
}

const PAGE_SIZE = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const oneOf = <T extends string>(values: readonly T[], value: string | null): T | undefined =>
  values.includes(value as T) ? (value as T) : undefined;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');
  // The sidebar hides the link; this is the gate that holds.
  if (!canEnrich(user)) throw redirect('/data');

  const params = new URL(request.url).searchParams;
  // Pending unless another status, or 'all', is asked for.
  const statusParam = params.get('status');
  const status = statusParam === 'all' ? undefined : (oneOf(SUGGESTION_STATUS_VALUES, statusParam) ?? 'pending');
  const kind = oneOf(SUGGESTION_KINDS, params.get('kind'));
  const mine = params.get('mine') === '1';
  const readyParam = params.get('ready');
  const ready = readyParam === 'yes' ? true : readyParam === 'no' ? false : undefined;
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const id = params.get('id');
  // One entry's suggestions, from the Entries tab.
  const glossaryParam = params.get('glossary');
  const glossaryId = glossaryParam && UUID.test(glossaryParam) ? glossaryParam : undefined;

  const [{ items, total }, selected, [filterEntry]] = await Promise.all([
    listSuggestionQueue({
      status,
      kind,
      ready,
      createdBy: mine ? user.id : undefined,
      glossaryId,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    id ? readSuggestionForQueue(id) : Promise.resolve(null),
    glossaryId ? readGlossariesByIds([glossaryId]) : Promise.resolve([]),
  ]);

  return json({
    items,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    filters: {
      status: status ?? 'all',
      kind: kind ?? 'all',
      mine,
      ready: readyParam ?? 'any',
      entry: glossaryId ? { id: glossaryId, sourceTerm: filterEntry?.sourceTerm ?? null } : null,
    },
    selectedId: id,
    selected,
    canFinalize: canFinalize(user),
  });
};

export type QueueActionResult =
  | { success: true; intent: QueueIntent; message: string }
  | { success: false; intent?: QueueIntent; error: string; code?: string; glossaryId?: string; fields?: string[] };

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');
  const t = await getFixedT(request);
  // Nobody outside the queue's roles acts on it; the service checks each operation's own rule too
  // (finalizing is admin-only).
  if (!canEnrich(user)) {
    return json<QueueActionResult>({ success: false, error: t('glossary:errors.notAllowed') }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json<QueueActionResult>({ success: false, error: t('glossary:queue.invalid') }, { status: 400 });
  }
  const parsed = queueRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json<QueueActionResult>({ success: false, error: t('glossary:queue.invalid') }, { status: 400 });
  }
  const request_ = parsed.data;

  try {
    switch (request_.intent) {
      case 'enrich':
        await enrichSuggestion(user, request_.id, request_.proposed);
        break;
      case 'ready':
        await setSuggestionReady(user, request_.id, request_.ready);
        break;
      case 'accept':
        await acceptSuggestion(user, request_.id, { note: request_.note, confirmStale: request_.confirmStale });
        break;
      case 'reject':
        await rejectSuggestion(user, request_.id, request_.note);
        break;
      case 'dismiss':
        await dismissFlag(user, request_.id, request_.note);
        break;
      case 'merge':
        await mergeIntoTerm(user, request_.id, request_.glossaryId);
        break;
      case 'flag-to-edit':
        await flagToEdit(user, request_.id, request_.proposed);
        break;
      case 'remove-translation':
        await removeFlaggedTranslation(user, request_.id, request_.note);
        break;
    }
  } catch (error) {
    if (!(error instanceof SuggestionError)) throw error;
    return json<QueueActionResult>(
      {
        success: false,
        intent: request_.intent,
        error: error.message,
        code: error.code,
        glossaryId: error.glossaryId,
        fields: error.fields ? [...error.fields] : undefined,
      },
      { status: SUGGESTION_ERROR_STATUS[error.code] },
    );
  }
  return json<QueueActionResult>({
    success: true,
    intent: request_.intent,
    message: t(`glossary:queue.done.${request_.intent}`),
  });
};

export default function GlossarySuggestions() {
  const { items, total, page, pageCount, filters, selectedId, selected, canFinalize } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation('glossary');

  // Changes one filter, back to the first page, keeping the open suggestion.
  const setFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value === null) next.delete(key);
    else next.set(key, value);
    next.delete('page');
    setSearchParams(next, { preventScrollReset: true });
  };
  const linkWith = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    return `?${next.toString()}`;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-primary text-2xl">{t('queue.title')}</CardTitle>
          <CardDescription className="text-base">{t('queue.description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <FilterSelect
            value={filters.status}
            label={t('queue.filters.status')}
            onChange={(value) => setFilter('status', value === 'pending' ? null : value)}
            options={[...SUGGESTION_STATUS_VALUES, 'all'].map((value) => ({
              value,
              label: t(`queue.status.${value as SuggestionStatus | 'all'}`),
            }))}
          />
          <FilterSelect
            value={filters.kind}
            label={t('queue.filters.kind')}
            onChange={(value) => setFilter('kind', value === 'all' ? null : value)}
            options={['all', ...SUGGESTION_KINDS].map((value) => ({
              value,
              label: t(`queue.kind.${value as SuggestionKind | 'all'}`),
            }))}
          />
          <FilterSelect
            value={filters.ready}
            label={t('queue.filters.ready')}
            onChange={(value) => setFilter('ready', value === 'any' ? null : value)}
            options={(['any', 'yes', 'no'] as const).map((value) => ({ value, label: t(`queue.ready.${value}`) }))}
          />
          <div className="flex items-center gap-2 pb-2">
            <Switch
              id="queue-mine"
              checked={filters.mine}
              onCheckedChange={(checked) => setFilter('mine', checked ? '1' : null)}
            />
            <Label htmlFor="queue-mine">{t('queue.filters.mine')}</Label>
          </div>
          {filters.entry && (
            <div className="flex items-center gap-2 pb-1.5">
              <Badge variant="outline" className="text-sm">
                {t('queue.filters.entry', { term: filters.entry.sourceTerm ?? t('queue.targetGone') })}
              </Badge>
              <Button size="sm" variant="ghost" onClick={() => setFilter('glossary', null)}>
                {t('queue.filters.clearEntry')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_3fr]">
        <Card className="h-fit">
          <CardContent className="p-2">
            {items.length === 0 ? (
              <p className="text-muted-foreground p-2 text-sm">{t('queue.empty')}</p>
            ) : (
              <>
                <p className="text-muted-foreground px-2 pb-1 text-xs">{t('queue.count', { count: total })}</p>
                <ul className="flex max-h-[40vh] flex-col overflow-y-auto lg:max-h-[calc(100vh-20rem)]">
                  {items.map((item) => (
                    <li key={item.id}>
                      <Link
                        preventScrollReset
                        to={linkWith('id', item.id)}
                        aria-current={item.id === selectedId ? 'true' : undefined}
                        className={`hover:bg-muted block rounded-md px-2 py-1.5 ${item.id === selectedId ? 'bg-muted' : ''}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-primary font-medium">{item.headword ?? t('queue.targetGone')}</span>
                          {item.rendering && (
                            <span className="text-muted-foreground truncate text-sm">{item.rendering}</span>
                          )}
                          <span className="ml-auto flex shrink-0 gap-1">
                            {item.ready && <Badge variant="outline">{t('queue.readyBadge')}</Badge>}
                            <Badge variant="secondary">{t(`queue.kind.${item.kind}`)}</Badge>
                          </span>
                        </div>
                        <div className="text-muted-foreground flex gap-2 text-xs">
                          <span>{item.submitter}</span>
                          <span>· {new Date(item.createdAt).toLocaleDateString()}</span>
                          {item.completeness && (
                            <span>
                              ·{' '}
                              {t('queue.completeness', {
                                filled: item.completeness.filled,
                                total: item.completeness.total,
                              })}
                            </span>
                          )}
                          {filters.status === 'all' && <span>· {t(`queue.status.${item.status}`)}</span>}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
                {pageCount > 1 && (
                  <div className="flex items-center justify-between px-2 pt-2 text-sm">
                    <PageLink to={page > 1 ? linkWith('page', String(page - 1)) : null}>{t('queue.previous')}</PageLink>
                    <span className="text-muted-foreground">{t('queue.page', { page, pageCount })}</span>
                    <PageLink to={page < pageCount ? linkWith('page', String(page + 1)) : null}>
                      {t('queue.next')}
                    </PageLink>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            {selected ? (
              // Keyed on the saved state, so a write (or someone else's) restarts the forms from it.
              <SuggestionQueueDetail
                detail={selected}
                canFinalize={canFinalize}
                key={`${selected.suggestion.id}-${selected.suggestion.updatedAt}`}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                {selectedId ? t('queue.notFound') : t('queue.selectHint')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-44" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function PageLink({ to, children }: { to: string | null; children: React.ReactNode }) {
  if (!to) {
    return (
      <Button disabled size="sm" variant="ghost">
        {children}
      </Button>
    );
  }
  return (
    <Button asChild size="sm" variant="ghost">
      <Link to={to} preventScrollReset>
        {children}
      </Link>
    </Button>
  );
}
