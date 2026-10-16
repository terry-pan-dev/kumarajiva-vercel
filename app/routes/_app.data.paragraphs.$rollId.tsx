import { Link, useActionData, useLoaderData, useNavigation, useRouteError } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { assertAuthUser } from '~/auth.server';
import { defineAbilityFor } from '~/authorisation';
import { CopyButton } from '~/components/data/CopyButton';
import { DeleteConfirmDialog } from '~/components/data/DeleteConfirmDialog';
import { ErrorInfo } from '~/components/ErrorInfo';
import { Badge } from '~/components/ui';
import { useToast } from '~/hooks/use-toast';
import { getFixedT } from '~/i18n/locale.server';
import { deleteParagraphCleanly, readParagraphsForDebug, type IParagraphDebugRow } from '~/services/paragraph.service';
import { getSection } from '~/services/text.service';

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
  const { rollId } = params;
  const [rows, section] = await Promise.all([readParagraphsForDebug(rollId as string), getSection(rollId as string)]);

  const sectionInfo = section
    ? { documentTitle: section.document?.title ?? '', sectionTitle: section.title ?? null }
    : null;

  const canDelete = defineAbilityFor(user).can('Administrate', 'TranslationData');
  return json({ success: true, rows, sectionInfo, rollId: rollId as string, canDelete });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  const t = await getFixedT(request);
  if (defineAbilityFor(user).cannot('Administrate', 'TranslationData')) {
    return json({ success: false, message: t('data:paragraphs.section.notAuthorisedToDelete') }, { status: 403 });
  }

  const formData = Object.fromEntries(await request.formData());
  const intent = formData['intent'];

  if (intent === 'delete-paragraph') {
    const paragraphId = formData['paragraphId'] as string;
    try {
      const result = await deleteParagraphCleanly({ id: paragraphId });
      return json({
        success: true,
        message: result.deletedChild
          ? t('data:paragraphs.section.deletedWithChild', { count: result.deletedParagraphIds.length })
          : t('data:paragraphs.section.deleted'),
        id: paragraphId,
      });
    } catch (error) {
      console.error('Error deleting paragraph:', error);
      return json({ success: false, message: t('data:rawData.deleteFailed') }, { status: 500 });
    }
  }

  return json({ success: false, message: t('data:rawData.unknownAction') }, { status: 400 });
}

// A row is anomalous when its ordering fields are out of the expected range or
// when its content is duplicated elsewhere in the same section.
function isNegative(value: number) {
  return value < 0;
}

function orderIsNegative(order: string) {
  const parsed = Number.parseFloat(order);
  return !Number.isNaN(parsed) && parsed < 0;
}

const MONO = 'font-mono text-xs';

// One display row: an origin paragraph together with the translation
// child(ren) that point at it. `origin` is null for orphan translations whose
// parent row is missing — surfaced so corruption is visible.
type PairedRow = { origin: IParagraphDebugRow | null; children: IParagraphDebugRow[]; key: string };

function ParagraphCell({
  row,
  duplicateContent,
  canDelete,
  onDelete,
}: {
  row: IParagraphDebugRow;
  duplicateContent: Map<string, number>;
  canDelete: boolean;
  onDelete: (row: IParagraphDebugRow) => void;
}) {
  const badOrder = orderIsNegative(row.order) || isNegative(row.number);
  const isDup = (duplicateContent.get(row.content) ?? 0) > 1;
  const { t } = useTranslation('data');
  const related = { references: row.referenceCount, comments: row.commentCount, history: row.historyCount };

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className={badOrder ? 'font-semibold text-red-600' : 'text-muted-foreground'}>
          {t('rawData.order', { order: row.order })}
        </span>
        <span className={MONO}>{row.id}</span>
        <CopyButton value={row.id} />
        <span className="text-muted-foreground" title={t('paragraphs.section.relatedCountsTooltip', related)}>
          {t('paragraphs.section.relatedCounts', related)}
        </span>
        {isDup && <Badge variant="destructive">{t('rawData.duplicate')}</Badge>}
        {canDelete && (
          <button
            type="button"
            onClick={() => onDelete(row)}
            className="text-muted-foreground hover:text-destructive"
            title={t(
              row.isOrigin ? 'paragraphs.section.deleteOriginTooltip' : 'paragraphs.section.deleteTranslationTooltip',
            )}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="whitespace-pre-wrap">{row.content}</div>
    </div>
  );
}

export default function ParagraphsDebug() {
  const { rows, sectionInfo, rollId, canDelete } = useLoaderData<typeof loader>();
  const actionData = useActionData<{ success: boolean; message: string; id?: string }>();
  const navigation = useNavigation();
  const { toast } = useToast();
  const { t } = useTranslation(['data', 'common']);

  const [filter, setFilter] = useState('');
  const [pendingDelete, setPendingDelete] = useState<IParagraphDebugRow | null>(null);

  useEffect(() => {
    if (!actionData) return;
    toast({
      variant: actionData.success ? 'default' : 'error',
      title: actionData.success ? t('common:toast.done') : t('common:toast.oops'),
      description: actionData.message,
      position: 'top-right',
    });
    if (actionData.success) setPendingDelete(null);
  }, [actionData, toast, t]);

  // Content duplicated within this section — the primary corruption signal.
  const duplicateContent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.content, (counts.get(row.content) ?? 0) + 1);
    return counts;
  }, [rows]);

  const anomalyCount = useMemo(
    () =>
      rows.filter((r) => isNegative(r.number) || orderIsNegative(r.order) || (duplicateContent.get(r.content) ?? 0) > 1)
        .length,
    [rows, duplicateContent],
  );

  // Pair each origin with the translation child(ren) that reference it; any
  // translation whose parent row is missing becomes its own origin-less row.
  const pairedRows = useMemo<PairedRow[]>(() => {
    const originIds = new Set(rows.filter((r) => r.isOrigin).map((r) => r.id));
    const childrenByParent = new Map<string, IParagraphDebugRow[]>();
    for (const r of rows) {
      if (!r.isOrigin && r.parentId) {
        const list = childrenByParent.get(r.parentId) ?? [];
        list.push(r);
        childrenByParent.set(r.parentId, list);
      }
    }

    const result: PairedRow[] = [];
    const shown = new Set<string>();
    for (const r of rows) {
      if (r.isOrigin) {
        const children = childrenByParent.get(r.id) ?? [];
        children.forEach((c) => shown.add(c.id));
        result.push({ origin: r, children, key: r.id });
      } else if (!shown.has(r.id) && (!r.parentId || !originIds.has(r.parentId))) {
        shown.add(r.id);
        result.push({ origin: null, children: [r], key: r.id });
      }
    }
    return result;
  }, [rows]);

  const visiblePairs = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return pairedRows;
    const match = (r: IParagraphDebugRow) =>
      r.content.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || r.order.toLowerCase().includes(q);
    return pairedRows.filter((p) => (p.origin && match(p.origin)) || p.children.some(match));
  }, [pairedRows, filter]);

  const isDeleting = navigation.state === 'submitting';

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
            {sectionInfo?.documentTitle}
            {sectionInfo?.sectionTitle && (
              <span className="text-muted-foreground font-normal"> / {sectionInfo.sectionTitle}</span>
            )}
          </h2>
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <span className={MONO}>{t('paragraphs.section.sectionId', { id: rollId })}</span>
            <span>·</span>
            <span>{t('rawData.paragraphCount', { count: rows.length })}</span>
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

      <div className="border-border flex-1 overflow-auto rounded border">
        <table className="w-full table-fixed border-collapse text-left">
          <thead className="bg-muted sticky top-0 z-10 text-xs">
            <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:font-medium">
              <th className="w-8">#</th>
              <th className="w-1/2">{t('paragraphs.section.originColumn')}</th>
              <th className="w-1/2">{t('paragraphs.section.translationColumn')}</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {visiblePairs.map((pair, index) => {
              const all = [pair.origin, ...pair.children].filter(Boolean) as IParagraphDebugRow[];
              const flagged =
                pair.origin === null ||
                pair.children.length > 1 ||
                all.some(
                  (r) => isNegative(r.number) || orderIsNegative(r.order) || (duplicateContent.get(r.content) ?? 0) > 1,
                );

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
                    {pair.origin ? (
                      <ParagraphCell
                        row={pair.origin}
                        canDelete={canDelete}
                        onDelete={setPendingDelete}
                        duplicateContent={duplicateContent}
                      />
                    ) : (
                      <span className="text-muted-foreground text-xs italic">{t('paragraphs.section.orphan')}</span>
                    )}
                  </td>
                  <td className="space-y-3 break-words">
                    {pair.children.length > 0 ? (
                      pair.children.map((child) => (
                        <ParagraphCell
                          row={child}
                          key={child.id}
                          canDelete={canDelete}
                          onDelete={setPendingDelete}
                          duplicateContent={duplicateContent}
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
                  {t(rows.length === 0 ? 'paragraphs.section.noParagraphs' : 'rawData.noMatches')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <DeleteConfirmDialog
        submitting={isDeleting}
        intent="delete-paragraph"
        open={pendingDelete !== null}
        title={t('rawData.deleteTitle')}
        fields={{ paragraphId: pendingDelete?.id ?? '' }}
        description={t('paragraphs.section.deleteDescription')}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        {pendingDelete && (
          <div className="bg-muted rounded p-3 text-sm">
            <div className={`${MONO} mb-1`}>{pendingDelete.id}</div>
            <div className="text-muted-foreground text-xs">
              {t(
                pendingDelete.isOrigin
                  ? 'paragraphs.section.deleteOriginNote'
                  : 'paragraphs.section.deleteTranslationNote',
              )}{' '}
              {t('paragraphs.section.deleteRelated', {
                references: pendingDelete.referenceCount,
                comments: pendingDelete.commentCount,
                history: pendingDelete.historyCount,
              })}
            </div>
            <div className="mt-2 line-clamp-3">{pendingDelete.content}</div>
          </div>
        )}
      </DeleteConfirmDialog>
    </div>
  );
}
