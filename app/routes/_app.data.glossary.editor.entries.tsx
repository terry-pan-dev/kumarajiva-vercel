// Glossary entry editor, in Data Management (docs/plans/glossary-suggestions.md, step 4).
//
// Where the trusted roles (GlossaryData Maintain: tech, admin) change the glossary directly: find
// an entry, edit its fields and translations, add or remove a translation, or move it to the
// trash. Changes are saved straight to the glossary, unreviewed. Everyone else suggests from the
// glossary page, which has no direct tools. The Suggestions tab beside it (step 7) is where their
// suggestions are worked on; an open entry links to its own.
//
// The save is the one the glossary page's edit form used: the whole translations list, matched by
// id, against the ids the form was opened with (glossary.diff.ts), through
// updateGlossaryTranslations, so search stays in sync.
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, Link, useFetcher, useLoaderData, useRouteError, useSearchParams } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { useEffect, useRef } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { assertAuthUser } from '~/auth.server';
import { defineAbilityFor } from '~/authorisation';
import { DeleteEntityButton } from '~/components/data/DeleteEntityButton';
import { ErrorInfo } from '~/components/ErrorInfo';
import { editFormValues, SourceTermFields, TranslationsFields } from '~/components/GlossaryForm';
import { Button, Input } from '~/components/ui';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { useToast } from '~/hooks/use-toast';
import { getFixedT } from '~/i18n/locale.server';
import { validatePayloadOrThrow } from '~/lib/payload.validation';
import { TranslationListError } from '~/services/glossary.diff';
import {
  readGlossariesByIds,
  searchGlossaryEntriesForEditing,
  trashGlossaryById,
  updateGlossaryTranslations,
} from '~/services/glossary.service';
import { countPendingSuggestions } from '~/services/suggestion.service';
import { glossaryEditFormSchema } from '~/validations/glossary.validation';

export function ErrorBoundary() {
  const error = useRouteError();
  return <ErrorInfo error={error} />;
}

const SEARCH_LIMIT = 50;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');
  // The sidebar hides the link; this is the gate that holds.
  if (defineAbilityFor(user).cannot('Maintain', 'GlossaryData')) throw redirect('/data');

  const searchParams = new URL(request.url).searchParams;
  const query = searchParams.get('q')?.trim() ?? '';
  const id = searchParams.get('id');
  const [results, [selected], pendingSuggestions] = await Promise.all([
    query ? searchGlossaryEntriesForEditing(query, SEARCH_LIMIT) : Promise.resolve([]),
    id ? readGlossariesByIds([id]) : Promise.resolve([]),
    id ? countPendingSuggestions(id) : Promise.resolve(0),
  ]);
  return json({ query, results, selectedId: id, selected: selected ?? null, pendingSuggestions });
};

type ActionResult = { success: boolean; message?: string; error?: string };

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');
  const t = await getFixedT(request);
  if (defineAbilityFor(user).cannot('Maintain', 'GlossaryData')) {
    return json<ActionResult>({ success: false, error: t('glossary:errors.notAllowed') }, { status: 403 });
  }
  const formData = Object.fromEntries(await request.formData());

  // The trash button (DeleteEntityButton). The entry and its translations are kept, so an admin
  // can restore it, or delete it for good, from the Glossary Inspector.
  if (formData.intent === 'delete-glossary') {
    const deletion = await trashGlossaryById(String(formData.glossaryId), user.id);
    if (!deletion) {
      return json<ActionResult>({ success: false, error: t('glossary:entries.notFound') }, { status: 404 });
    }
    return json<ActionResult>({ success: true, message: t('glossary:entries.trashed', { term: deletion.term }) });
  }

  if (formData.intent === 'edit') {
    const validated = validatePayloadOrThrow({
      schema: glossaryEditFormSchema,
      formData: JSON.parse(String(formData.data)),
    });
    const [existing] = await readGlossariesByIds([validated.id]);
    if (!existing) {
      return json<ActionResult>({ success: false, error: t('glossary:entries.notFound') }, { status: 404 });
    }
    // Who and when, for the store: it stamps only the translations whose content changed.
    const now = new Date().toISOString();
    const { id, phonetic = null, cbetaFrequency = null } = validated;
    try {
      await updateGlossaryTranslations({
        id,
        phonetic,
        // The term's author records who created the entry, and its discussion is only ever
        // blank: the form edits neither, and null leaves both as stored.
        author: null,
        discussion: null,
        cbetaFrequency,
        updatedBy: phonetic || cbetaFrequency ? user.id : null,
        translations: validated.translations.map((translation) => ({
          ...translation,
          updatedBy: user.id,
          updatedAt: now,
        })),
        basis: validated.baseTranslationIds,
      });
    } catch (error) {
      // Someone else removed one of these translations since the form was opened.
      if (error instanceof TranslationListError) {
        return json<ActionResult>({ success: false, error: t('glossary:entries.stale') }, { status: 409 });
      }
      throw error;
    }
    return json<ActionResult>({ success: true, message: t('glossary:entries.saved', { term: existing.sourceTerm }) });
  }

  return json<ActionResult>({ success: false, error: t('glossary:errors.unknownAction') }, { status: 400 });
};

type LoaderData = ReturnType<typeof useLoaderData<typeof loader>>;
type Entry = NonNullable<LoaderData['selected']>;

export default function GlossaryEntries() {
  const { query, results, selectedId, selected, pendingSuggestions } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation('glossary');

  // Keeps the search when an entry is opened.
  const linkTo = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('id', id);
    return `?${next.toString()}`;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-primary text-2xl">{t('entries.title')}</CardTitle>
          <CardDescription className="text-base">{t('entries.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="get" className="flex gap-2">
            <Input
              name="q"
              defaultValue={query}
              aria-label={t('entries.search')}
              placeholder={t('entries.searchPlaceholder')}
            />
            <Button type="submit">{t('entries.search')}</Button>
          </Form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
        <Card className="h-fit">
          <CardContent className="p-2">
            {!query ? (
              <p className="text-muted-foreground p-2 text-sm">{t('entries.searchHint')}</p>
            ) : results.length === 0 ? (
              <p className="text-muted-foreground p-2 text-sm">{t('entries.noResults', { query })}</p>
            ) : (
              <>
                <p className="text-muted-foreground px-2 pb-1 text-xs">
                  {t('entries.resultCount', { count: results.length })}
                </p>
                {/* Scrolls on its own, so a long list never pushes the editor out of view (below it on
                    narrow screens, beside it on wide ones). */}
                <ul className="flex max-h-[30vh] flex-col overflow-y-auto lg:max-h-[calc(100vh-16rem)]">
                  {results.map((entry) => (
                    <li key={entry.id}>
                      <Link
                        preventScrollReset
                        to={linkTo(entry.id)}
                        aria-current={entry.id === selectedId ? 'true' : undefined}
                        className={`hover:bg-muted block rounded-md px-2 py-1.5 ${entry.id === selectedId ? 'bg-muted' : ''}`}
                      >
                        <span className="text-primary font-medium">{entry.sourceTerm}</span>
                        <span className="text-muted-foreground line-clamp-1 text-sm">
                          {entry.translations.map((translation) => translation.term).join(' · ')}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            {selected ? (
              // Keyed on the saved state, so a save (or someone else's) restarts the form from it.
              <EntryEditor
                entry={selected}
                pendingSuggestions={pendingSuggestions}
                key={`${selected.id}-${selected.updatedAt}`}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                {selectedId ? t('entries.notFound') : t('entries.selectHint')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EntryEditor({ entry, pendingSuggestions }: { entry: Entry; pendingSuggestions: number }) {
  const { t } = useTranslation(['glossary', 'common']);
  const { toast } = useToast();
  const fetcher = useFetcher<ActionResult>();
  const saving = fetcher.state !== 'idle';
  const form = useForm({ resolver: zodResolver(glossaryEditFormSchema), defaultValues: editFormValues(entry) });

  // Each answer once.
  const handled = useRef<ActionResult | undefined>(undefined);
  useEffect(() => {
    const data = fetcher.data;
    if (fetcher.state !== 'idle' || !data || handled.current === data) return;
    handled.current = data;
    toast({
      variant: data.success ? 'default' : 'error',
      title: data.success ? t('common:toast.done') : t('common:toast.oops'),
      description: data.success ? data.message : data.error,
      position: 'top-right',
    });
  }, [fetcher.state, fetcher.data, toast, t]);

  return (
    <FormProvider {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) =>
          fetcher.submit({ intent: 'edit', data: JSON.stringify(values) }, { method: 'post' }),
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-primary text-2xl font-semibold">{entry.sourceTerm}</h2>
          <DeleteEntityButton
            size={20}
            id={entry.id}
            idName="glossaryId"
            entity="glossaryEntry"
            intent="delete-glossary"
            label={entry.sourceTerm}
            description={t('entries.trashDescription', { term: entry.sourceTerm, count: entry.translations.length })}
          />
        </div>
        {/* Every suggestion about this entry, pending or not: its history. */}
        <Link
          className="text-primary w-fit text-sm underline"
          to={`/data/glossary/editor/suggestions?glossary=${entry.id}&status=all`}
        >
          {t('entries.suggestionsLink', { count: pendingSuggestions })}
        </Link>
        <SourceTermFields />
        <TranslationsFields />
        <div className="flex justify-end gap-2">
          <Button type="button" disabled={saving} variant="secondary" onClick={() => form.reset(editFormValues(entry))}>
            {t('common:actions.reset')}
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? t('common:actions.saving') : t('entries.save')}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
