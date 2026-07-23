// Raw-data inspector for paragraphs_new, organised by document. Shows every
// section of the document — including stray or empty ones — with its uuid and
// every paragraph row (including parked rows with negative order that reader
// views hide). Admins can delete single paragraphs or a whole section with all
// its paragraphs and search-index entries.
//
// With ?compare=<documentId>, a second document is shown side by side, rows
// paired by passage_key — the cross-document pairing used for translations.
// Deletion is only offered in single-document view to keep that interaction
// deliberate.
import { Form, Link, useActionData, useLoaderData, useNavigation, useRouteError } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { ArrowLeft, Copy, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { assertAuthUser } from '~/auth.server';
import { defineAbilityFor } from '~/authorisation';
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
import {
  deleteParagraph,
  deleteSectionWithParagraphs,
  getDocument,
  readParagraphsForDebugByDocumentId,
  type IParagraphNewDebugRow,
} from '~/services/text.service';

export function ErrorBoundary() {
  const error = useRouteError();
  return <ErrorInfo error={error} />;
}

const toSectionInfo = (s: { id: string; title: string | null; order: number; children: unknown[] }) => ({
  id: s.id,
  title: s.title,
  order: s.order,
  childCount: s.children.length,
});

export async function loader({ params, request }: LoaderFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  // The raw-data inspector is admin-only, even though managers can otherwise
  // read Data Management. The sidebar hides the link, but this is the gate that
  // actually holds.
  if (defineAbilityFor(user).cannot('Read', 'Inspector')) {
    throw redirect('/data');
  }
  const { documentId } = params;
  const document = await getDocument(documentId as string);
  if (!document) {
    throw new Error('Document not found');
  }

  const url = new URL(request.url);
  const compareId = url.searchParams.get('compare');
  const compareDocument = compareId ? await getDocument(compareId) : null;

  const [rows, compareRows] = await Promise.all([
    readParagraphsForDebugByDocumentId(documentId as string),
    compareDocument ? readParagraphsForDebugByDocumentId(compareDocument.id) : Promise.resolve([]),
  ]);

  const canDelete = defineAbilityFor(user).can('Delete', 'DataManagement');
  return json({
    success: true,
    document: {
      id: document.id,
      title: document.title,
      language: document.language,
      workTitle: document.work?.title ?? '',
      sections: document.sections.map(toSectionInfo),
    },
    compareDocument: compareDocument
      ? { id: compareDocument.id, title: compareDocument.title, language: compareDocument.language }
      : null,
    rows,
    compareRows,
    canDelete,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  if (defineAbilityFor(user).cannot('Delete', 'DataManagement')) {
    return json({ success: false, message: 'You are not authorised to delete data.' }, { status: 403 });
  }

  const formData = Object.fromEntries(await request.formData());
  const intent = formData['intent'];

  if (intent === 'delete-paragraph') {
    const paragraphId = formData['paragraphId'] as string;
    try {
      await deleteParagraph({ id: paragraphId });
      return json({ success: true, message: 'Deleted paragraph and its search-index entry.' });
    } catch (error) {
      console.error('Error deleting paragraph:', error);
      return json({ success: false, message: 'Failed to delete paragraph.' }, { status: 500 });
    }
  }

  if (intent === 'delete-section') {
    const sectionId = formData['sectionId'] as string;
    try {
      const result = await deleteSectionWithParagraphs({ id: sectionId });
      return json({
        success: true,
        message: `Deleted section and ${result.deletedParagraphCount} paragraph(s) with their search-index entries.`,
      });
    } catch (error) {
      console.error('Error deleting section:', error);
      const message = error instanceof Error ? error.message : 'Failed to delete section.';
      return json({ success: false, message }, { status: 500 });
    }
  }

  return json({ success: false, message: 'Unknown action.' }, { status: 400 });
}

// A row is anomalous when it is parked (negative order), lacks the passage key
// that pairs it with its counterpart, or duplicates content within its document.
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

type SectionInfo = { id: string; title: string | null; order: number; childCount: number };

type PendingDelete =
  | { type: 'paragraph'; row: IParagraphNewDebugRow }
  | { type: 'section'; section: SectionInfo; paragraphCount: number };

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

export default function DocumentInspector() {
  const { document, compareDocument, rows, compareRows, canDelete } = useLoaderData<typeof loader>();
  const actionData = useActionData<{ success: boolean; message: string }>();
  const navigation = useNavigation();
  const { toast } = useToast();

  const [filter, setFilter] = useState('');
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  const isComparing = compareDocument !== null;

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

  // Content duplicated within the same document — the primary corruption signal.
  const duplicateContent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of [...rows, ...compareRows]) counts.set(row.content, (counts.get(row.content) ?? 0) + 1);
    return counts;
  }, [rows, compareRows]);

  const rowsBySection = useMemo(() => {
    const map = new Map<string, IParagraphNewDebugRow[]>();
    for (const row of rows) {
      const list = map.get(row.sectionId) ?? [];
      list.push(row);
      map.set(row.sectionId, list);
    }
    return map;
  }, [rows]);

  // Compare mode: counterpart rows by passage_key, plus the leftovers that
  // match nothing on the origin side.
  const { compareByPassageKey, orphanCompareRows } = useMemo(() => {
    const byKey = new Map<string, IParagraphNewDebugRow>();
    for (const row of compareRows) {
      if (row.passageKey && !byKey.has(row.passageKey)) byKey.set(row.passageKey, row);
    }
    const originKeys = new Set(rows.map((r) => r.passageKey).filter(Boolean));
    const orphans = compareRows.filter((r) => !r.passageKey || !originKeys.has(r.passageKey));
    return { compareByPassageKey: byKey, orphanCompareRows: orphans };
  }, [rows, compareRows]);

  const anomalyCount = useMemo(
    () =>
      [...rows, ...compareRows].filter(
        (r) => isParked(r) || !r.passageKey || (duplicateContent.get(r.content) ?? 0) > 1,
      ).length,
    [rows, compareRows, duplicateContent],
  );

  const matchesFilter = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return () => true;
    return (r: IParagraphNewDebugRow) =>
      r.content.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q) ||
      String(r.order).includes(q) ||
      (r.passageKey ?? '').toLowerCase().includes(q);
  }, [filter]);

  const sections = [...document.sections].sort((a, b) => a.order - b.order);
  const isDeleting = navigation.state === 'submitting';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2">
        <div>
          <Link
            to="/data/inspector"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="h-4 w-4" /> Back to documents
          </Link>
          <h2 className="text-foreground mt-1 text-lg font-semibold">
            {document.workTitle && <span className="text-muted-foreground font-normal">{document.workTitle} / </span>}
            {document.title} <Badge variant="secondary">{document.language}</Badge>
            {compareDocument && (
              <span className="text-muted-foreground font-normal">
                {' '}
                vs {compareDocument.title} <Badge variant="secondary">{compareDocument.language}</Badge>
              </span>
            )}
          </h2>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            <span className={MONO}>document {document.id}</span>
            <CopyButton value={document.id} />
            <span>·</span>
            <span>
              {sections.length} sections / {rows.length} paragraphs
              {isComparing && ` vs ${compareRows.length} paragraphs`}
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

      <div className="flex-1 space-y-4 overflow-auto pb-4">
        {sections.map((section) => {
          const sectionRows = (rowsBySection.get(section.id) ?? []).filter(matchesFilter);
          const totalInSection = rowsBySection.get(section.id)?.length ?? 0;

          return (
            <div key={section.id} className="border-border rounded border">
              <div className="bg-muted flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-sm">
                <span className="font-medium">
                  {section.title ?? <span className="text-muted-foreground italic">untitled section</span>}
                </span>
                <span className="text-muted-foreground text-xs">order {section.order}</span>
                <span className={MONO}>{section.id}</span>
                <CopyButton value={section.id} />
                <span className="text-muted-foreground text-xs">· {totalInSection} paragraphs</span>
                {totalInSection === 0 && <Badge variant="destructive">empty</Badge>}
                <div className="flex-1" />
                {canDelete && !isComparing && (
                  <button
                    type="button"
                    title="Delete this section and all its paragraphs"
                    className="text-muted-foreground hover:text-destructive flex items-center gap-1 text-xs"
                    onClick={() => setPendingDelete({ type: 'section', section, paragraphCount: totalInSection })}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete section
                  </button>
                )}
              </div>

              {sectionRows.length > 0 ? (
                <table className="w-full table-fixed border-collapse text-left">
                  {isComparing && (
                    <thead className="text-muted-foreground text-xs">
                      <tr className="[&>th]:px-2 [&>th]:py-1 [&>th]:font-medium">
                        <th className="w-1/2">{document.title}</th>
                        <th className="w-1/2">{compareDocument?.title}</th>
                      </tr>
                    </thead>
                  )}
                  <tbody className="text-sm">
                    {sectionRows.map((row, index) => {
                      const counterpart = row.passageKey ? compareByPassageKey.get(row.passageKey) : undefined;
                      const flagged =
                        isParked(row) ||
                        !row.passageKey ||
                        (duplicateContent.get(row.content) ?? 0) > 1 ||
                        (isComparing && !counterpart);

                      return (
                        <tr
                          key={row.id}
                          className={[
                            'border-border border-t align-top [&>td]:px-2 [&>td]:py-2',
                            flagged ? 'bg-destructive/10' : index % 2 ? 'bg-muted/30' : '',
                          ].join(' ')}
                        >
                          <td className="break-words">
                            <ParagraphCell
                              row={row}
                              duplicateContent={duplicateContent}
                              canDelete={canDelete && !isComparing}
                              onDelete={(r) => setPendingDelete({ type: 'paragraph', row: r })}
                            />
                          </td>
                          {isComparing && (
                            <td className="break-words">
                              {counterpart ? (
                                <ParagraphCell
                                  canDelete={false}
                                  row={counterpart}
                                  onDelete={() => {}}
                                  duplicateContent={duplicateContent}
                                />
                              ) : (
                                <span className="text-muted-foreground text-xs">— no counterpart —</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="text-muted-foreground p-3 text-center text-xs">
                  {totalInSection === 0 ? 'No paragraphs in this section.' : 'No rows match the filter.'}
                </div>
              )}
            </div>
          );
        })}

        {isComparing && orphanCompareRows.length > 0 && (
          <div className="border-destructive/50 rounded border">
            <div className="bg-destructive/10 px-3 py-2 text-sm font-medium">
              Unmatched in {compareDocument?.title} — {orphanCompareRows.length} paragraph(s) with no counterpart by
              passage key
            </div>
            <table className="w-full table-fixed border-collapse text-left">
              <tbody className="text-sm">
                {orphanCompareRows.filter(matchesFilter).map((row) => (
                  <tr key={row.id} className="border-border border-t align-top [&>td]:px-2 [&>td]:py-2">
                    <td className="break-words">
                      <ParagraphCell
                        row={row}
                        canDelete={false}
                        onDelete={() => {}}
                        duplicateContent={duplicateContent}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {sections.length === 0 && (
          <div className="text-muted-foreground p-6 text-center text-sm">No sections found for this document.</div>
        )}
      </div>

      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent aria-describedby="delete-description">
          <DialogHeader>
            <DialogTitle>
              {pendingDelete?.type === 'section' ? 'Delete this section?' : 'Delete this paragraph?'}
            </DialogTitle>
            <DialogDescription id="delete-description">
              {pendingDelete?.type === 'section'
                ? 'This permanently removes the section together with ALL its paragraphs and their search-index entries. This cannot be undone.'
                : 'This permanently removes the paragraph and its search-index entry. Its counterpart (paired by passage key) is NOT deleted automatically. This cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          {pendingDelete?.type === 'paragraph' && (
            <div className="bg-muted rounded p-3 text-sm">
              <div className={`${MONO} mb-1`}>{pendingDelete.row.id}</div>
              <div className="text-muted-foreground text-xs">
                order {pendingDelete.row.order} · passage key {pendingDelete.row.passageKey ?? '—'}
              </div>
              <div className="mt-2 line-clamp-3">{pendingDelete.row.content}</div>
            </div>
          )}
          {pendingDelete?.type === 'section' && (
            <div className="bg-muted rounded p-3 text-sm">
              <div className="font-medium">{pendingDelete.section.title ?? 'untitled section'}</div>
              <div className={`${MONO} mb-1`}>{pendingDelete.section.id}</div>
              <div className="text-muted-foreground text-xs">
                order {pendingDelete.section.order} · {pendingDelete.paragraphCount} paragraph(s) will be deleted with
                it.
                {pendingDelete.section.childCount > 0 &&
                  ` This section has ${pendingDelete.section.childCount} child section(s) — deletion will be refused until they are removed.`}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={isDeleting}>
                Cancel
              </Button>
            </DialogClose>
            <Form method="post">
              <input
                type="hidden"
                name="intent"
                value={pendingDelete?.type === 'section' ? 'delete-section' : 'delete-paragraph'}
              />
              {pendingDelete?.type === 'paragraph' && (
                <input type="hidden" name="paragraphId" value={pendingDelete.row.id} />
              )}
              {pendingDelete?.type === 'section' && (
                <input type="hidden" name="sectionId" value={pendingDelete.section.id} />
              )}
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
