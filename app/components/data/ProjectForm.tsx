import { useFetcher } from '@remix-run/react';
import { X } from 'lucide-react';
import { useEffect } from 'react';

import { SUPPORTED_LANGUAGES } from '~/utils/constants';

import { inputClass, selectClass, textareaClass } from './fieldClasses';

const bg = 'bg-background';

export type ProjectForForm = {
  sourceDocument: {
    id: string;
    workId: string;
    title: string;
    subtitle: string | null;
    language: string;
  };
  targetDocument: {
    id: string;
    title: string;
    subtitle: string | null;
    language: string;
  };
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
  works?: WorkWithDocuments[];
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ success: boolean }>();
  const isSubmitting = fetcher.state === 'submitting';

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) onClose();
  }, [fetcher.state, fetcher.data, onClose]);

  const allDocuments = works?.flatMap((w) => w.documents.map((d) => ({ ...d, workTitle: w.title }))) ?? [];

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
        {project ? (
          // ── Edit mode: update document titles / languages ──
          <>
            <input type="hidden" name="intent" value="update" />
            <input type="hidden" name="documentId" value={project.sourceDocument.id} />
            <input type="hidden" name="childDocumentId" value={project.targetDocument.id} />
            <input type="hidden" name="workId" value={project.sourceDocument.workId} />

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-3">
                <p className="text-primary-foreground/70 text-xs font-semibold tracking-wider uppercase">Original</p>
                <div>
                  <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">
                    Title <span className="text-destructive">*</span>
                  </label>
                  <textarea
                    required
                    rows={2}
                    name="originTitle"
                    className={textareaClass(bg)}
                    defaultValue={project.sourceDocument.title}
                  />
                </div>
                <div>
                  <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">Subtitle</label>
                  <textarea
                    rows={2}
                    name="originSubtitle"
                    className={textareaClass(bg)}
                    defaultValue={project.sourceDocument.subtitle ?? ''}
                  />
                </div>
                <div>
                  <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">
                    Language <span className="text-destructive">*</span>
                  </label>
                  <select
                    required
                    name="originLang"
                    className={selectClass(bg)}
                    defaultValue={project.sourceDocument.language}
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={lang.value} value={lang.value}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-primary-foreground/70 text-xs font-semibold tracking-wider uppercase">Translation</p>
                <div>
                  <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">Title</label>
                  <textarea
                    rows={2}
                    name="translationTitle"
                    className={textareaClass(bg)}
                    defaultValue={project.targetDocument.title}
                  />
                </div>
                <div>
                  <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">Subtitle</label>
                  <textarea
                    rows={2}
                    name="translationSubtitle"
                    className={textareaClass(bg)}
                    defaultValue={project.targetDocument.subtitle ?? ''}
                  />
                </div>
                <div>
                  <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">Language</label>
                  <select
                    name="translationLang"
                    className={selectClass(bg)}
                    defaultValue={project.targetDocument.language}
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={lang.value} value={lang.value}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </>
        ) : (
          // ── Create mode: select existing documents ──
          <>
            <input type="hidden" name="intent" value="create-project" />

            <div>
              <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">Project Name</label>
              <input name="name" className={inputClass(bg)} placeholder="e.g., Great Prajnaparamita Sutra" />
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">
                  Source Document <span className="text-destructive">*</span>
                </label>
                <select required name="sourceDocumentId" className={selectClass(bg)}>
                  <option value="">Select source document…</option>
                  {allDocuments.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.workTitle} — {doc.title} ({doc.language})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">
                  Target Document <span className="text-destructive">*</span>
                </label>
                <select required name="targetDocumentId" className={selectClass(bg)}>
                  <option value="">Select target document…</option>
                  {allDocuments.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.workTitle} — {doc.title} ({doc.language})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <button
            type="reset"
            className="text-primary-foreground/70 hover:text-primary-foreground rounded px-4 py-2 text-sm transition"
          >
            Reset
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
    </div>
  );
}
