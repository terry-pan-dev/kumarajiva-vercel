// Raw paragraph data for one section of one project: the source section's rows
// beside the translation section's, paired by passage_key — the pairing the
// translation editor uses. Shows every row, including parked ones (negative
// order) that reader views hide, and flags what looks wrong: parked rows,
// missing or repeated passage keys, repeated content, orphan translations and
// passages with more than one translation. Maintainers can append a passage
// (source, plus its translation if the section exists); admins can delete
// single rows.
//
// The project comes from the URL because a source document can belong to
// several projects; the section is the source section, as in the editor's URL.
import { Form, Link, useActionData, useLoaderData, useNavigation, useRouteError } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Lang } from '~/utils/constants';

import { assertAuthUser } from '~/auth.server';
import { defineAbilityFor } from '~/authorisation';
import { CopyButton } from '~/components/data/CopyButton';
import { DeleteConfirmDialog } from '~/components/data/DeleteConfirmDialog';
import { ErrorInfo } from '~/components/ErrorInfo';
import { Badge, Button } from '~/components/ui';
import { Textarea } from '~/components/ui/textarea';
import { useToast } from '~/hooks/use-toast';
import { LocalizedError, localizeError } from '~/i18n/errors';
import { getFixedT } from '~/i18n/locale.server';
import {
  contentCounts,
  duplicatePassageKeys,
  nextPassage,
  pairByPassageKey,
  type RowProblem,
  rowProblems,
} from '~/services/paragraph.pairing';
import { resolveSectionContext } from '~/services/project.service';
import {
  appendPassage,
  deleteParagraph,
  getParagraph,
  type IParagraphNewDebugRow,
  readParagraphsForDebugBySectionId,
} from '~/services/text.service';

export function ErrorBoundary() {
  const error = useRouteError();
  return <ErrorInfo error={error} />;
}

export async function loader({ params, request }: LoaderFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  if (defineAbilityFor(user).cannot('Maintain', 'TranslationData')) {
    throw redirect('/data');
  }
  const { projectId, sectionId } = params;
  const context = projectId && sectionId ? await resolveSectionContext(projectId, sectionId) : null;
  if (!context) {
    const t = await getFixedT(request);
    throw new Response(t('data:errors.sectionNotFound'), { status: 404 });
  }

  const targetSection = context.target.section;
  const [sourceRows, targetRows] = await Promise.all([
    readParagraphsForDebugBySectionId(context.origin.section.id),
    targetSection ? readParagraphsForDebugBySectionId(targetSection.id) : Promise.resolve([]),
  ]);

  return json({
    success: true,
    projectId: context.projectId,
    source: context.origin,
    target: context.target,
    passageKeyPrefix: context.passageKeyPrefix,
    sourceRows,
    targetRows,
    canDelete: defineAbilityFor(user).can('Administrate', 'TranslationData'),
  });
}

export async function action({ params, request }: ActionFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  const t = await getFixedT(request);
  const ability = defineAbilityFor(user);
  const formData = Object.fromEntries(await request.formData());
  const intent = formData['intent'];
  const { projectId, sectionId } = params;

  if (intent === 'add-passage') {
    // The same permission as the import, which also creates paragraphs.
    if (ability.cannot('Maintain', 'TranslationData')) {
      return json({ success: false, intent, message: t('data:paragraphs.section.add.notAuthorised') }, { status: 403 });
    }
    const context = projectId && sectionId ? await resolveSectionContext(projectId, sectionId) : null;
    if (!context) {
      return json({ success: false, intent, message: t('data:errors.sectionNotFound') }, { status: 404 });
    }
    try {
      const added = await appendPassage({
        context,
        source: String(formData['source'] ?? ''),
        translation: String(formData['translation'] ?? ''),
        userId: user.id,
      });
      const message =
        t('data:paragraphs.section.add.added', { count: added.created, order: added.order, key: added.passageKey }) +
        (added.searchError ? t('data:paragraphs.section.add.searchSyncFailed', { error: added.searchError }) : '');
      return json({ success: true, intent, message });
    } catch (error) {
      if (!(error instanceof LocalizedError)) console.error('Error adding passage:', error);
      const message =
        error instanceof LocalizedError ? localizeError(error, t) : t('data:paragraphs.section.add.failed');
      return json({ success: false, intent, message }, { status: error instanceof LocalizedError ? 400 : 500 });
    }
  }

  if (intent !== 'delete-paragraph') {
    return json({ success: false, intent, message: t('data:rawData.unknownAction') }, { status: 400 });
  }
  if (ability.cannot('Administrate', 'TranslationData')) {
    return json(
      { success: false, intent, message: t('data:paragraphs.section.notAuthorisedToDelete') },
      { status: 403 },
    );
  }

  // Only rows this page shows can be deleted from it: the paragraph must sit in
  // the project's source section or its translation section.
  const context = projectId && sectionId ? await resolveSectionContext(projectId, sectionId) : null;
  const paragraph = await getParagraph(String(formData['paragraphId'] ?? ''));
  const sectionIds = [context?.origin.section.id, context?.target.section?.id].filter(Boolean);
  if (!context || !paragraph || !sectionIds.includes(paragraph.sectionId)) {
    return json({ success: false, intent, message: t('data:paragraphs.section.notInSection') }, { status: 404 });
  }

  try {
    await deleteParagraph({ id: paragraph.id });
    return json({ success: true, intent, message: t('data:paragraphs.section.deleted') });
  } catch (error) {
    console.error('Error deleting paragraph:', error);
    return json({ success: false, intent, message: t('data:rawData.deleteFailed') }, { status: 500 });
  }
}

const MONO = 'font-mono text-xs';

const PROBLEM_LABEL = {
  parked: 'paragraphs.section.problems.parked',
  'no-passage-key': 'paragraphs.section.problems.noPassageKey',
  'duplicate-passage-key': 'paragraphs.section.problems.duplicatePassageKey',
  'duplicate-content': 'paragraphs.section.problems.duplicateContent',
} as const satisfies Record<RowProblem, string>;

type Side = 'source' | 'target';
type PendingDelete = { row: IParagraphNewDebugRow; side: Side };

function ParagraphCell({
  row,
  problems,
  canDelete,
  onDelete,
}: {
  row: IParagraphNewDebugRow;
  problems: RowProblem[];
  canDelete: boolean;
  onDelete: () => void;
}) {
  const { t } = useTranslation('data');

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className={problems.includes('parked') ? 'font-semibold text-red-600' : 'text-muted-foreground'}>
          {t('rawData.order', { order: row.order })}
        </span>
        <span className={row.passageKey ? 'text-muted-foreground' : 'font-semibold text-red-600'}>
          {row.passageKey ?? t('paragraphs.section.problems.noPassageKey')}
        </span>
        {Object.entries(row.metadata ?? {}).map(([field, value]) => (
          <span key={field} className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-medium">
            {field === 'page' ? t('inspector.document.page', { page: value }) : `${field}: ${value}`}
          </span>
        ))}
        <span className={MONO}>{row.id}</span>
        <CopyButton value={row.id} />
        {problems
          .filter((problem) => problem !== 'no-passage-key') // already shown in place of the key
          .map((problem) => (
            <Badge key={problem} variant="destructive">
              {t(PROBLEM_LABEL[problem])}
            </Badge>
          ))}
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            title={t('paragraphs.section.deleteTooltip')}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="whitespace-pre-wrap">{row.content}</div>
    </div>
  );
}

// Appends a passage after the section's last row. The position shown is what the server will
// pick unless someone else adds a row first; the server works it out again and checks the key.
function AddPassageForm({
  next,
  targetTitle,
  hasTarget,
  submitting,
}: {
  next: { order: number; passageKey: string };
  targetTitle: string;
  hasTarget: boolean;
  submitting: boolean;
}) {
  const { t } = useTranslation('data');
  return (
    <Form method="post" className="border-border bg-background mt-2 space-y-2 rounded border p-3">
      <input type="hidden" name="intent" value="add-passage" />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-foreground text-sm font-semibold">{t('paragraphs.section.add.title')}</h3>
        <span className="text-muted-foreground text-xs">
          {t('paragraphs.section.add.position', { order: next.order, key: next.passageKey })}
        </span>
      </div>
      <p className="text-muted-foreground text-xs">{t('paragraphs.section.add.description')}</p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <label className="space-y-1 text-xs font-medium">
          <span>{t('paragraphs.section.add.sourceLabel')}</span>
          <Textarea required rows={3} name="source" disabled={submitting} />
        </label>
        <label className="space-y-1 text-xs font-medium">
          <span>{t('paragraphs.section.add.translationLabel')}</span>
          <Textarea rows={3} name="translation" disabled={submitting || !hasTarget} />
          {!hasTarget && (
            <span className="text-muted-foreground block font-normal">
              {t('paragraphs.section.add.noTargetSectionHint', { title: targetTitle })}
            </span>
          )}
        </label>
      </div>
      <div className="flex justify-end">
        <Button size="sm" type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
          {t('paragraphs.section.add.submit')}
        </Button>
      </div>
    </Form>
  );
}

export default function ParagraphsSection() {
  const { source, target, passageKeyPrefix, sourceRows, targetRows, canDelete } = useLoaderData<typeof loader>();
  const actionData = useActionData<{ success: boolean; intent?: string; message: string }>();
  const navigation = useNavigation();
  const { toast } = useToast();
  const { t } = useTranslation(['data', 'common']);

  const [filter, setFilter] = useState('');
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [addFormKey, setAddFormKey] = useState(0);

  useEffect(() => {
    if (!actionData) return;
    toast({
      variant: actionData.success ? 'default' : 'error',
      title: actionData.success ? t('common:toast.done') : t('common:toast.oops'),
      description: actionData.message,
      position: 'top-right',
    });
    if (actionData.success && actionData.intent === 'delete-paragraph') setPendingDelete(null);
    // A fresh form after each passage added, so the next one starts empty.
    if (actionData.success && actionData.intent === 'add-passage') setAddFormKey((key) => key + 1);
  }, [actionData, toast, t]);

  const next = useMemo(
    () => nextPassage([...sourceRows, ...targetRows], passageKeyPrefix, source.section.order),
    [sourceRows, targetRows, passageKeyPrefix, source.section.order],
  );

  // Each side is judged against its own document's rows: a repeated key or
  // content is only a problem within one document.
  const problemsOf = useMemo(() => {
    const contexts = {
      source: { contentCounts: contentCounts(sourceRows), duplicateKeys: duplicatePassageKeys(sourceRows) },
      target: { contentCounts: contentCounts(targetRows), duplicateKeys: duplicatePassageKeys(targetRows) },
    };
    return (row: IParagraphNewDebugRow, side: Side) => rowProblems(row, contexts[side]);
  }, [sourceRows, targetRows]);

  const pairs = useMemo(() => pairByPassageKey(sourceRows, targetRows), [sourceRows, targetRows]);

  const anomalyCount = useMemo(
    () =>
      sourceRows.filter((r) => problemsOf(r, 'source').length > 0).length +
      targetRows.filter((r) => problemsOf(r, 'target').length > 0).length,
    [sourceRows, targetRows, problemsOf],
  );

  const visiblePairs = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return pairs;
    const match = (r: IParagraphNewDebugRow) =>
      r.content.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q) ||
      String(r.order).includes(q) ||
      (r.passageKey ?? '').toLowerCase().includes(q);
    return pairs.filter((p) => (p.source && match(p.source)) || p.targets.some(match));
  }, [pairs, filter]);

  const submittingIntent = navigation.state === 'submitting' ? navigation.formData?.get('intent') : null;
  const isDeleting = submittingIntent === 'delete-paragraph';
  const isEmpty = sourceRows.length === 0 && targetRows.length === 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2">
        <div>
          <Link
            to="/data/paragraphs"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="h-4 w-4" /> {t('paragraphs.section.back')}
          </Link>
          <h2 className="text-foreground mt-1 text-lg font-semibold">
            {source.document.title}
            {source.section.title && (
              <span className="text-muted-foreground font-normal"> / {source.section.title}</span>
            )}
          </h2>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            <span className={MONO}>{t('paragraphs.section.sectionId', { id: source.section.id })}</span>
            <CopyButton value={source.section.id} />
            <span>·</span>
            <span>{t('paragraphs.section.sourceCount', { count: sourceRows.length })}</span>
            <span>·</span>
            <span>{t('paragraphs.section.targetCount', { count: targetRows.length })}</span>
            {anomalyCount > 0 && (
              <>
                <span>·</span>
                <Badge variant="destructive">{t('rawData.flaggedCount', { count: anomalyCount })}</Badge>
              </>
            )}
          </div>
        </div>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('paragraphs.section.filterPlaceholder')}
          className="border-border bg-background w-64 rounded border px-2 py-1 text-sm"
        />
      </div>

      {!target.section && (
        <div className="text-muted-foreground mb-2 rounded border border-dashed px-3 py-2 text-sm">
          {t('paragraphs.section.noTargetSection', { title: target.document.title })}
        </div>
      )}

      <div className="border-border flex-1 overflow-auto rounded border">
        <table className="w-full table-fixed border-collapse text-left">
          <thead className="bg-muted sticky top-0 z-10 text-xs">
            <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:font-medium">
              <th className="w-8">#</th>
              <th className="w-1/2">
                {t('paragraphs.section.sourceColumn')}{' '}
                <span className="text-muted-foreground font-normal">
                  {source.document.title} · {t(`common:languages.${source.document.language as Lang}`)}
                </span>
              </th>
              <th className="w-1/2">
                {t('paragraphs.section.translationColumn')}{' '}
                <span className="text-muted-foreground font-normal">
                  {target.document.title} · {t(`common:languages.${target.document.language as Lang}`)}
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {visiblePairs.map((pair, index) => {
              const sourceProblems = pair.source ? problemsOf(pair.source, 'source') : [];
              const targetProblems = pair.targets.map((row) => problemsOf(row, 'target'));
              const flagged =
                pair.source === null ||
                pair.targets.length > 1 ||
                sourceProblems.length > 0 ||
                targetProblems.some((problems) => problems.length > 0);

              return (
                <tr
                  key={pair.key}
                  className={[
                    'border-border border-t align-top [&>td]:px-2 [&>td]:py-2',
                    flagged ? 'bg-destructive/10' : index % 2 ? 'bg-muted/30' : '',
                  ].join(' ')}
                >
                  <td className="text-muted-foreground text-xs">{index + 1}</td>
                  <td className="break-words">
                    {pair.source ? (
                      <ParagraphCell
                        row={pair.source}
                        canDelete={canDelete}
                        problems={sourceProblems}
                        onDelete={() => pair.source && setPendingDelete({ row: pair.source, side: 'source' })}
                      />
                    ) : (
                      <span className="text-muted-foreground text-xs italic">{t('paragraphs.section.orphan')}</span>
                    )}
                  </td>
                  <td className="space-y-3 break-words">
                    {pair.targets.length > 1 && (
                      <Badge variant="destructive">
                        {t('paragraphs.section.multipleTranslations', { count: pair.targets.length })}
                      </Badge>
                    )}
                    {pair.targets.length > 0 ? (
                      pair.targets.map((row, i) => (
                        <ParagraphCell
                          row={row}
                          key={row.id}
                          canDelete={canDelete}
                          problems={targetProblems[i]}
                          onDelete={() => setPendingDelete({ row, side: 'target' })}
                        />
                      ))
                    ) : (
                      <span className="text-muted-foreground text-xs">{t('paragraphs.section.notTranslated')}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {visiblePairs.length === 0 && (
              <tr>
                <td colSpan={3} className="text-muted-foreground p-6 text-center text-sm">
                  {t(isEmpty ? 'paragraphs.section.noParagraphs' : 'rawData.noMatches')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AddPassageForm
        next={next}
        key={addFormKey}
        hasTarget={target.section !== null}
        targetTitle={target.document.title}
        submitting={submittingIntent === 'add-passage'}
      />

      <DeleteConfirmDialog
        submitting={isDeleting}
        intent="delete-paragraph"
        open={pendingDelete !== null}
        title={t('rawData.deleteTitle')}
        fields={{ paragraphId: pendingDelete?.row.id ?? '' }}
        description={t('paragraphs.section.deleteDescription')}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        {pendingDelete && (
          <div className="bg-muted rounded p-3 text-sm">
            <div className={`${MONO} mb-1`}>{pendingDelete.row.id}</div>
            <div className="text-muted-foreground text-xs">
              {t(
                pendingDelete.side === 'source'
                  ? 'paragraphs.section.deleteSourceNote'
                  : 'paragraphs.section.deleteTranslationNote',
              )}
            </div>
            <div className="mt-2 line-clamp-3">{pendingDelete.row.content}</div>
          </div>
        )}
      </DeleteConfirmDialog>
    </div>
  );
}
