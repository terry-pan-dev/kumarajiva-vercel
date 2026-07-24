import { useFetcher } from '@remix-run/react';
import { Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { DocumentForm } from './DocumentForm';
import { inputClass, selectClass } from './fieldClasses';

const bg = 'bg-background';

export type ProjectForForm = {
  id: string;
  name: string;
  workId: string;
  sourceDocumentId: string;
  targetDocumentId: string;
  references: { documentId: string }[];
};

type WorkWithDocuments = {
  id: string;
  title: string;
  documents: {
    id: string;
    title: string;
    language: string;
  }[];
};

export function ProjectForm({
  project,
  works,
  onClose,
}: {
  project?: ProjectForForm;
  works: WorkWithDocuments[];
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ success: boolean }>();
  const isSubmitting = fetcher.state === 'submitting';

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) onClose();
  }, [fetcher.state, fetcher.data, onClose]);

  // A project's source, target and references must all belong to the same work,
  // so we pick the work first and scope every document picker to it — the DB's
  // composite FKs then can never be violated. Edit mode seeds these from the
  // existing project.
  const [workId, setWorkId] = useState(project?.workId ?? '');
  const [sourceId, setSourceId] = useState(project?.sourceDocumentId ?? '');
  const [targetId, setTargetId] = useState(project?.targetDocumentId ?? '');
  const [referenceIds, setReferenceIds] = useState<string[]>(project?.references.map((r) => r.documentId) ?? []);
  const [pendingReferenceId, setPendingReferenceId] = useState('');
  const [showNewDocument, setShowNewDocument] = useState(false);

  const workDocuments = works.find((w) => w.id === workId)?.documents ?? [];
  const documentLabel = (id: string) => {
    const doc = workDocuments.find((d) => d.id === id);
    return doc ? `${doc.title} (${doc.language})` : id;
  };

  // Candidate reference documents: same work, minus the source/target and any
  // already picked. Commentaries live as documents of the work they comment on,
  // so they surface here alongside alternate renderings.
  const referenceCandidates = workDocuments.filter(
    (doc) => doc.id !== sourceId && doc.id !== targetId && !referenceIds.includes(doc.id),
  );

  // Changing the work invalidates every document choice below it.
  const handleWorkChange = (nextWorkId: string) => {
    setWorkId(nextWorkId);
    setSourceId('');
    setTargetId('');
    setReferenceIds([]);
    setPendingReferenceId('');
  };

  const addReference = () => {
    if (!pendingReferenceId) return;
    setReferenceIds((prev) => [...prev, pendingReferenceId]);
    setPendingReferenceId('');
  };

  const removeReference = (id: string) => setReferenceIds((prev) => prev.filter((refId) => refId !== id));

  return (
    <div className="bg-primary text-primary-foreground rounded-lg p-5 shadow-xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-primary-foreground text-sm font-semibold">
          {project ? 'Edit Project' : 'Add New Project'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-primary-foreground/60 hover:text-primary-foreground transition"
        >
          <X size={16} />
        </button>
      </div>

      <fetcher.Form method="post" className="space-y-4">
        <input type="hidden" name="intent" value={project ? 'update-project' : 'create-project'} />
        {project && <input type="hidden" name="projectId" value={project.id} />}
        {referenceIds.map((id) => (
          <input key={id} value={id} type="hidden" name="referenceDocumentId" />
        ))}

        <div>
          <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">Project Name</label>
          <input
            name="name"
            className={inputClass(bg)}
            defaultValue={project?.name ?? ''}
            placeholder="e.g., Great Prajnaparamita Sutra"
          />
        </div>

        <div>
          <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">
            Work <span className="text-destructive">*</span>
          </label>
          <select
            required
            value={workId}
            className={selectClass(bg)}
            onChange={(e) => handleWorkChange(e.target.value)}
          >
            <option value="">Select work…</option>
            {works.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title}
              </option>
            ))}
          </select>
        </div>

        {workId && (
          <>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">
                  Source Document <span className="text-destructive">*</span>
                </label>
                <select
                  required
                  value={sourceId}
                  name="sourceDocumentId"
                  className={selectClass(bg)}
                  onChange={(e) => setSourceId(e.target.value)}
                >
                  <option value="">Select source document…</option>
                  {workDocuments
                    .filter((doc) => doc.id !== targetId)
                    .map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.title} ({doc.language})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">
                  Target Document <span className="text-destructive">*</span>
                </label>
                <select
                  required
                  value={targetId}
                  name="targetDocumentId"
                  className={selectClass(bg)}
                  onChange={(e) => setTargetId(e.target.value)}
                >
                  <option value="">Select target document…</option>
                  {workDocuments
                    .filter((doc) => doc.id !== sourceId)
                    .map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.title} ({doc.language})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* References: other documents of this work the project consults */}
            <div>
              <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">References</label>
              {referenceIds.length > 0 && (
                <ul className="mb-2 space-y-1.5">
                  {referenceIds.map((id) => (
                    <li
                      key={id}
                      className="bg-background/10 flex items-center justify-between rounded px-3 py-1.5 text-sm"
                    >
                      <span>{documentLabel(id)}</span>
                      <button
                        type="button"
                        title="Remove reference"
                        onClick={() => removeReference(id)}
                        className="text-primary-foreground/50 hover:text-primary-foreground transition"
                      >
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center gap-2">
                <select
                  value={pendingReferenceId}
                  className={selectClass(bg) + ' flex-1'}
                  disabled={referenceCandidates.length === 0}
                  onChange={(e) => setPendingReferenceId(e.target.value)}
                >
                  <option value="">
                    {referenceCandidates.length === 0
                      ? 'No more documents in this work'
                      : 'Select a reference document…'}
                  </option>
                  {referenceCandidates.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title} ({doc.language})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addReference}
                  disabled={!pendingReferenceId}
                  className="bg-background text-foreground hover:bg-muted flex items-center gap-1 rounded px-3 py-2 text-sm font-medium transition disabled:opacity-50"
                >
                  <Plus size={14} />
                  Add
                </button>
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="text-primary-foreground/70 hover:text-primary-foreground rounded px-4 py-2 text-sm transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-background text-foreground hover:bg-muted rounded px-4 py-2 text-sm font-medium transition disabled:opacity-50"
          >
            {isSubmitting ? 'Saving…' : project ? 'Update Project' : 'Create Project'}
          </button>
        </div>
      </fetcher.Form>

      {/* Reuse DocumentForm to add a document to the selected work inline. Kept
          OUTSIDE the project <form> (forms can't nest) and collapsed by default.
          On success DocumentForm revalidates the loader, so the new document
          appears in the source/target/reference lists automatically. */}
      {workId && (
        <div className="border-primary-foreground/20 mt-4 border-t pt-4">
          <button
            type="button"
            onClick={() => setShowNewDocument((v) => !v)}
            className="text-primary-foreground/70 hover:text-primary-foreground flex items-center gap-1.5 text-xs font-medium transition"
          >
            <Plus size={14} className={showNewDocument ? 'rotate-45 transition' : 'transition'} />
            Create new document in this work
          </button>
          {showNewDocument && (
            <div className="mt-3">
              <DocumentForm workId={workId} onClose={() => setShowNewDocument(false)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
