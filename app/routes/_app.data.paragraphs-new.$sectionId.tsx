// Raw-data inspector for paragraphs_new — the counterpart of
// _app.data.paragraphs.$rollId.tsx for the refactored data model. Shows every
// row for a section (including parked rows with negative order that reader
// views hide), pairs origin and translation by passage_key across the
// project's source/target documents, and lets admins delete corrupt rows.
import { Form, Link, useActionData, useLoaderData, useNavigation, useRouteError } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { ArrowLeft, Copy, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { assertAuthUser } from '~/auth.server';
import { ErrorInfo } from '~/components/ErrorInfo';
import { Icons } from '~/components/icons';
import {
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui';
import { useToast } from '~/hooks/use-toast';
import { getProjectBySourceDocumentId } from '~/services/project.service';
import {
  deleteParagraph,
  getSection,
  readParagraphsForDebugBySectionId,
  type IParagraphNewDebugRow,
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
  const { sectionId } = params;
  const section = await getSection(sectionId as string);
  if (!section) {
    throw new Error('Section not found');
  }

  // Translations live in the target document's counterpart section (matched by
  // order); fetch both sides so orphans on either side are visible.
  const project = await getProjectBySourceDocumentId(section.documentId);
  const targetSection = project?.targetDocument?.sections.find((s) => s.order === section.order) ?? null;

  const [sourceRows, targetRows] = await Promise.all([
    readParagraphsForDebugBySectionId(sectionId as string),
    targetSection ? readParagraphsForDebugBySectionId(targetSection.id) : Promise.resolve([]),
  ]);

  const sectionInfo = { documentTitle: section.document?.title ?? '', sectionTitle: section.title ?? null };

  const canDelete = user.role === 'admin' || user.role === 'manager';
  return json({
    success: true,
    sourceRows,
    targetRows,
    sectionInfo,
    sectionId: sectionId as string,
    targetSectionId: targetSection?.id ?? null,
    canDelete,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  if (user.role !== 'admin' && user.role !== 'manager') {
    return json({ success: false, message: 'You are not authorised to delete paragraphs.' }, { status: 403 });
  }

  const formData = Object.fromEntries(await request.formData());
  const intent = formData['intent'];

  if (intent === 'delete-paragraph') {
    const paragraphId = formData['paragraphId'] as string;
    try {
      await deleteParagraph({ id: paragraphId });
      return json({
        success: true,
        message: 'Deleted paragraph and its search-index entry.',
        id: paragraphId,
      });
    } catch (error) {
      console.error('Error deleting paragraph:', error);
      return json({ success: false, message: 'Failed to delete paragraph.' }, { status: 500 });
    }
  }

  return json({ success: false, message: 'Unknown action.' }, { status: 400 });
}

// A row is anomalous when it is parked (negative order), lacks the passage key
// that pairs it with its counterpart, or duplicates content within its section.
function isParked(row: IParagraphNewDebugRow) {
  return row.order < 0;
}

const MONO = 'font-mono text-xs';

function CopyButton({ value }: { value: string }) {
  const { toast } = useToast();
  return (
    <button
      title="Copy"
      type="button"
      className="text-muted-foreground hover:text-foreground shrink-0"
      onClick={() => {
        navigator.clipboard?.writeText(value);
        toast({ variant: 'default', title: 'Copied', position: 'top-right' });
      }}
    >
      <Copy className="h-3 w-3" />
    </button>
  );
}

// One display row: an origin paragraph together with the translation row(s)
// sharing its passage_key. `origin` is null for orphan translations whose
// passage_key matches no origin — surfaced so corruption is visible.
type PairedRow = { origin: IParagraphNewDebugRow | null; children: IParagraphNewDebugRow[]; key: string };

function ParagraphCell({
  row,
  duplicateContent,
  canDelete,
  onDelete,
}: {
  row: IParagraphNewDebugRow;
  duplicateContent: Map<string, number>;
  canDelete: boolean;
  onDelete: (row: IParagraphNewDebugRow) => void;
}) {
  const isDup = (duplicateContent.get(row.content) ?? 0) > 1;

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className={isParked(row) ? 'font-semibold text-red-600' : 'text-muted-foreground'}>
          order {row.order}
        </span>
        <span className={row.passageKey ? 'text-muted-foreground' : 'font-semibold text-red-600'}>
          {row.passageKey ?? 'no passage key'}
        </span>
        <span className={MONO}>{row.id}</span>
        <CopyButton value={row.id} />
        {isParked(row) && <Badge variant="destructive">parked</Badge>}
        {isDup && <Badge variant="destructive">dup</Badge>}
        {canDelete && (
          <button
            type="button"
            onClick={() => onDelete(row)}
            title="Delete this paragraph"
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

export default function ParagraphsNewDebug() {
  const { sourceRows, targetRows, sectionInfo, sectionId, canDelete } = useLoaderData<typeof loader>();
  const actionData = useActionData<{ success: boolean; message: string; id?: string }>();
  const navigation = useNavigation();
  const { toast } = useToast();

  const [filter, setFilter] = useState('');
  const [pendingDelete, setPendingDelete] = useState<IParagraphNewDebugRow | null>(null);

  useEffect(() => {
    if (!actionData) return;
    toast({
      variant: actionData.success ? 'default' : 'error',
      title: actionData.success ? 'Done' : 'Oops!',
      description: actionData.message,
      position: 'top-right',
    });
    if (actionData.success) setPendingDelete(null);
  }, [actionData, toast]);

  const allRows = useMemo(() => [...sourceRows, ...targetRows], [sourceRows, targetRows]);

  // Content duplicated within the same section — the primary corruption signal.
  const duplicateContent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of allRows) counts.set(row.content, (counts.get(row.content) ?? 0) + 1);
    return counts;
  }, [allRows]);

  const anomalyCount = useMemo(
    () => allRows.filter((r) => isParked(r) || !r.passageKey || (duplicateContent.get(r.content) ?? 0) > 1).length,
    [allRows, duplicateContent],
  );

  // Pair each origin with the target row(s) sharing its passage_key; any
  // target whose key matches no origin becomes its own origin-less row.
  const pairedRows = useMemo<PairedRow[]>(() => {
    const targetsByKey = new Map<string, IParagraphNewDebugRow[]>();
    const keylessTargets: IParagraphNewDebugRow[] = [];
    for (const r of targetRows) {
      if (r.passageKey) {
        const list = targetsByKey.get(r.passageKey) ?? [];
        list.push(r);
        targetsByKey.set(r.passageKey, list);
      } else {
        keylessTargets.push(r);
      }
    }

    const result: PairedRow[] = [];
    const shown = new Set<string>();
    for (const r of sourceRows) {
      const children = r.passageKey ? (targetsByKey.get(r.passageKey) ?? []) : [];
      children.forEach((c) => shown.add(c.id));
      result.push({ origin: r, children, key: r.id });
    }
    for (const r of [...targetRows.filter((t) => !shown.has(t.id) && t.passageKey), ...keylessTargets]) {
      result.push({ origin: null, children: [r], key: r.id });
    }
    return result;
  }, [sourceRows, targetRows]);

  const visiblePairs = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return pairedRows;
    const match = (r: IParagraphNewDebugRow) =>
      r.content.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q) ||
      String(r.order).includes(q) ||
      (r.passageKey ?? '').toLowerCase().includes(q);
    return pairedRows.filter((p) => (p.origin && match(p.origin)) || p.children.some(match));
  }, [pairedRows, filter]);

  const isDeleting = navigation.state === 'submitting';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2">
        <div>
          <Link
            to="/data/paragraphs-new"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="h-4 w-4" /> Back to sections
          </Link>
          <h2 className="text-foreground mt-1 text-lg font-semibold">
            {sectionInfo?.documentTitle}
            {sectionInfo?.sectionTitle && (
              <span className="text-muted-foreground font-normal"> / {sectionInfo.sectionTitle}</span>
            )}
          </h2>
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <span className={MONO}>section {sectionId}</span>
            <span>·</span>
            <span>
              {sourceRows.length} origin / {targetRows.length} translation paragraphs
            </span>
            {anomalyCount > 0 && (
              <>
                <span>·</span>
                <Badge variant="destructive">{anomalyCount} flagged</Badge>
              </>
            )}
          </div>
        </div>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter rows (content, uuid, passage key…)"
          className="border-border bg-background w-64 rounded border px-2 py-1 text-sm"
        />
      </div>

      <div className="border-border flex-1 overflow-auto rounded border">
        <table className="w-full table-fixed border-collapse text-left">
          <thead className="bg-muted sticky top-0 z-10 text-xs">
            <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:font-medium">
              <th className="w-8">#</th>
              <th className="w-1/2">Origin</th>
              <th className="w-1/2">Translation</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {visiblePairs.map((pair, index) => {
              const all = [pair.origin, ...pair.children].filter(Boolean) as IParagraphNewDebugRow[];
              const flagged =
                pair.origin === null ||
                pair.children.length > 1 ||
                all.some((r) => isParked(r) || !r.passageKey || (duplicateContent.get(r.content) ?? 0) > 1);

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
                      <span className="text-muted-foreground text-xs italic">
                        orphan translation — no origin shares its passage key
                      </span>
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
                      <span className="text-muted-foreground text-xs">— not translated —</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {visiblePairs.length === 0 && (
              <tr>
                <td colSpan={3} className="text-muted-foreground p-6 text-center text-sm">
                  {allRows.length === 0 ? 'No paragraphs found for this section.' : 'No rows match the filter.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent aria-describedby="delete-paragraph-description">
          <DialogHeader>
            <DialogTitle>Delete this paragraph?</DialogTitle>
            <DialogDescription id="delete-paragraph-description">
              This permanently removes the paragraph and its search-index entry. Its counterpart (paired by passage key)
              is NOT deleted automatically. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {pendingDelete && (
            <div className="bg-muted rounded p-3 text-sm">
              <div className={`${MONO} mb-1`}>{pendingDelete.id}</div>
              <div className="text-muted-foreground text-xs">
                order {pendingDelete.order} · passage key {pendingDelete.passageKey ?? '—'}
              </div>
              <div className="mt-2 line-clamp-3">{pendingDelete.content}</div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={isDeleting}>
                Cancel
              </Button>
            </DialogClose>
            <Form method="post">
              <input type="hidden" name="intent" value="delete-paragraph" />
              <input type="hidden" name="paragraphId" value={pendingDelete?.id ?? ''} />
              <Button type="submit" variant="destructive" disabled={isDeleting}>
                {isDeleting ? <Icons.Loader className="h-4 w-4 animate-spin" /> : 'Delete'}
              </Button>
            </Form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
