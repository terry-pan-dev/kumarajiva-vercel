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
  const { rollId } = params;
  const [rows, section] = await Promise.all([readParagraphsForDebug(rollId as string), getSection(rollId as string)]);

  const sectionInfo = section
    ? { documentTitle: section.document?.title ?? '', sectionTitle: section.title ?? null }
    : null;

  const canDelete = user.role === 'admin' || user.role === 'manager';
  return json({ success: true, rows, sectionInfo, rollId: rollId as string, canDelete });
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
      const result = await deleteParagraphCleanly({ id: paragraphId });
      return json({
        success: true,
        message: result.deletedChild
          ? `Deleted paragraph and its translation child (${result.deletedParagraphIds.length} rows).`
          : 'Deleted paragraph and its related data.',
        id: paragraphId,
      });
    } catch (error) {
      console.error('Error deleting paragraph:', error);
      return json({ success: false, message: 'Failed to delete paragraph.' }, { status: 500 });
    }
  }

  return json({ success: false, message: 'Unknown action.' }, { status: 400 });
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

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className={badOrder ? 'font-semibold text-red-600' : 'text-muted-foreground'}>order {row.order}</span>
        <span className={MONO}>{row.id}</span>
        <CopyButton value={row.id} />
        <span
          className="text-muted-foreground"
          title={`${row.referenceCount} references · ${row.commentCount} comments · ${row.historyCount} history`}
        >
          r{row.referenceCount} c{row.commentCount} h{row.historyCount}
        </span>
        {isDup && <Badge variant="destructive">dup</Badge>}
        {canDelete && (
          <button
            type="button"
            onClick={() => onDelete(row)}
            className="text-muted-foreground hover:text-destructive"
            title={row.isOrigin ? 'Delete this paragraph and its translation child' : 'Delete this translation'}
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

  const [filter, setFilter] = useState('');
  const [pendingDelete, setPendingDelete] = useState<IParagraphDebugRow | null>(null);

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
            <ArrowLeft className="h-4 w-4" /> Back to sections
          </Link>
          <h2 className="text-foreground mt-1 text-lg font-semibold">
            {sectionInfo?.documentTitle}
            {sectionInfo?.sectionTitle && (
              <span className="text-muted-foreground font-normal"> / {sectionInfo.sectionTitle}</span>
            )}
          </h2>
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <span className={MONO}>roll {rollId}</span>
            <span>·</span>
            <span>{rows.length} paragraphs</span>
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
          placeholder="Filter rows (content, uuid, order…)"
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
                      <span className="text-muted-foreground text-xs italic">
                        orphan translation — parent paragraph missing
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
                  {rows.length === 0 ? 'No paragraphs found for this section.' : 'No rows match the filter.'}
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
              This permanently removes the paragraph together with its references, comments, history and search-index
              entry. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {pendingDelete && (
            <div className="bg-muted rounded p-3 text-sm">
              <div className={`${MONO} mb-1`}>{pendingDelete.id}</div>
              <div className="text-muted-foreground text-xs">
                {pendingDelete.isOrigin
                  ? 'This is an origin paragraph — its translation child will also be deleted.'
                  : 'This is a translation paragraph.'}{' '}
                Related rows: {pendingDelete.referenceCount} references, {pendingDelete.commentCount} comments,{' '}
                {pendingDelete.historyCount} history.
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
