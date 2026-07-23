// Document Inspector picker. Documents are organised by work (not by project,
// which would hide documents no project points at): select one document to
// inspect its sections and raw paragraph rows — including stray sections — or
// two documents to compare them side by side, paired by passage_key.
import { Link, useLoaderData, useNavigate, useRouteError } from '@remix-run/react';
import { json, redirect, type LoaderFunctionArgs } from '@vercel/remix';
import { Columns2, Copy, Eye } from 'lucide-react';
import { useState } from 'react';

import { assertAuthUser } from '~/auth.server';
import { ErrorInfo } from '~/components/ErrorInfo';
import { Badge, Button } from '~/components/ui';
import { useToast } from '~/hooks/use-toast';
import { getDocumentParagraphCounts, getDocuments, getWorks } from '~/services/text.service';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  try {
    const [works, documents, paragraphCounts] = await Promise.all([
      getWorks(),
      getDocuments(),
      getDocumentParagraphCounts(),
    ]);

    const documentsByWork = new Map<string, typeof documents>();
    for (const document of documents) {
      const list = documentsByWork.get(document.workId) ?? [];
      list.push(document);
      documentsByWork.set(document.workId, list);
    }

    return json({
      success: true,
      works: works.map((w) => ({
        id: w.id,
        title: w.title,
        cbeta: w.cbeta,
        documents: (documentsByWork.get(w.id) ?? []).map((d) => ({
          id: d.id,
          title: d.title,
          subtitle: d.subtitle,
          language: d.language,
          sectionCount: d.sections.length,
          paragraphCount: paragraphCounts.get(d.id) ?? 0,
        })),
      })),
    });
  } catch (error) {
    console.error(error);
    throw new Error('Internal Server Error');
  }
};

export const ErrorBoundary = () => {
  const error = useRouteError();
  return <ErrorInfo error={error} />;
};

const MONO = 'font-mono text-xs';

function CopyButton({ value }: { value: string }) {
  const { toast } = useToast();
  return (
    <button
      title="Copy"
      type="button"
      className="text-muted-foreground hover:text-foreground shrink-0"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(value);
        toast({ variant: 'default', title: 'Copied', position: 'top-right' });
      }}
    >
      <Copy className="h-3 w-3" />
    </button>
  );
}

export default function DocumentInspectorIndex() {
  const { works } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  // Selection order matters: the first pick is the left/origin side of a
  // comparison. At most two documents can be selected, across all works.
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  };

  if (works.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-lg">
        <p>No works available.</p>
        <p>Please create works and documents in Data Management first.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-4 p-4">
        {/* Sticky so the actions stay visible while scrolling a long list. */}
        <div className="bg-secondary sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-2 px-4 py-2">
          <div className="text-muted-foreground text-sm">
            {selected.length === 2
              ? 'Two documents selected — click "Compare documents".'
              : 'Select one document to inspect its sections and paragraph rows, or two documents to compare them side by side (first selected = origin).'}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={selected.length !== 1}
              onClick={() => navigate(`/data/inspector/${selected[0]}`)}
            >
              <Eye className="mr-1 h-4 w-4" /> View document
            </Button>
            <Button
              size="sm"
              disabled={selected.length !== 2}
              variant={selected.length === 2 ? 'default' : 'secondary'}
              onClick={() => navigate(`/data/inspector/${selected[0]}?compare=${selected[1]}`)}
            >
              <Columns2 className="mr-1 h-4 w-4" /> Compare documents
            </Button>
          </div>
        </div>

        {works.map((work) => (
          <div key={work.id} className="border-border bg-background overflow-hidden rounded-lg border shadow-sm">
            <div className="bg-muted flex flex-wrap items-center gap-x-2 gap-y-1 p-4">
              <h3 className="text-foreground text-lg font-semibold">{work.title}</h3>
              {work.cbeta && <Badge variant="secondary">{work.cbeta}</Badge>}
              <span className={`${MONO} text-muted-foreground`}>{work.id}</span>
              <CopyButton value={work.id} />
              <span className="text-muted-foreground text-xs">· {work.documents.length} documents</span>
            </div>

            <div className="divide-border divide-y border-t">
              {work.documents.length > 0 ? (
                work.documents.map((document) => {
                  const selectionIndex = selected.indexOf(document.id);
                  const isSelected = selectionIndex !== -1;

                  return (
                    <div
                      key={document.id}
                      onClick={() => toggle(document.id)}
                      className={`flex cursor-pointer items-center gap-3 p-4 transition ${
                        isSelected ? 'bg-muted' : 'hover:bg-muted/50'
                      }`}
                    >
                      <input
                        readOnly
                        type="checkbox"
                        checked={isSelected}
                        className="h-4 w-4 shrink-0"
                        disabled={!isSelected && selected.length >= 2}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-foreground flex flex-wrap items-center gap-2 font-medium">
                          {document.title}
                          {document.subtitle && (
                            <span className="text-muted-foreground text-sm font-normal">{document.subtitle}</span>
                          )}
                          <Badge variant="secondary">{document.language}</Badge>
                          {isSelected && selected.length === 2 && (
                            <Badge variant="default">{selectionIndex === 0 ? 'origin' : 'compare'}</Badge>
                          )}
                        </div>
                        <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                          <span className={MONO}>{document.id}</span>
                          <CopyButton value={document.id} />
                          <span>·</span>
                          <span>{document.sectionCount} sections</span>
                          <span>·</span>
                          <span>{document.paragraphCount} paragraphs</span>
                        </div>
                      </div>
                      {/* Hidden once a pair is selected — the next step is the
                          Compare button, and "view" would drop the selection. */}
                      {selected.length < 2 && (
                        <Link
                          onClick={(e) => e.stopPropagation()}
                          to={`/data/inspector/${document.id}`}
                          className="text-muted-foreground hover:text-foreground shrink-0 text-xs underline"
                        >
                          view
                        </Link>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-muted-foreground p-4 text-center text-sm">No documents for this work.</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
