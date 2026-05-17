import { useFetcher } from '@remix-run/react';
import { Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { CONTRIBUTOR_ROLE_VALUES, SUPPORTED_LANGUAGES } from '~/utils/constants';

import type { DocumentForForm, ProjectForForm } from './types';

import { inputClass, selectClass, textareaClass } from './fieldClasses';

const bg = 'bg-background';

function ContributorsField({ document, label }: { document: DocumentForForm; label: string }) {
  const deleteFetcher = useFetcher();
  const addFetcher = useFetcher<{ success: boolean }>();
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<string>(CONTRIBUTOR_ROLE_VALUES[0]);

  useEffect(() => {
    if (addFetcher.state === 'idle' && addFetcher.data?.success) {
      setNewName('');
      setNewRole(CONTRIBUTOR_ROLE_VALUES[0]);
    }
  }, [addFetcher.state, addFetcher.data]);

  return (
    <div>
      <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">{label}</label>
      <div className="space-y-1">
        {document.contributors.map((c) => (
          <div key={c.id} className="bg-primary-foreground/10 flex items-center justify-between rounded px-2 py-1">
            <span className="text-sm">
              {c.name} <span className="text-xs capitalize opacity-60">({c.role})</span>
            </span>
            <button
              type="button"
              title="Remove contributor"
              className="text-primary-foreground/50 hover:text-primary-foreground transition"
              onClick={() =>
                deleteFetcher.submit({ intent: 'delete-contributor', contributorId: c.id }, { method: 'post' })
              }
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1">
        <input
          value={newName}
          placeholder="Name"
          className={inputClass(bg)}
          onChange={(e) => setNewName(e.target.value)}
        />
        <select value={newRole} className={selectClass(bg)} onChange={(e) => setNewRole(e.target.value)}>
          {CONTRIBUTOR_ROLE_VALUES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        <button
          type="button"
          title="Add contributor"
          disabled={!newName.trim() || addFetcher.state !== 'idle'}
          className="bg-primary-foreground/20 hover:bg-primary-foreground/30 flex shrink-0 items-center rounded px-2 transition disabled:opacity-40"
          onClick={() =>
            addFetcher.submit(
              { intent: 'create-contributor', documentId: document.id, name: newName.trim(), role: newRole },
              { method: 'post' },
            )
          }
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

export function SutraForm({ project, onClose }: { project?: ProjectForForm; onClose: () => void }) {
  const fetcher = useFetcher<{ success: boolean }>();
  const isSubmitting = fetcher.state === 'submitting';

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) onClose();
  }, [fetcher.state, fetcher.data, onClose]);

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
        <input type="hidden" name="intent" value={project ? 'update' : 'create'} />
        {project && <input type="hidden" name="documentId" value={project.sourceDocument.id} />}
        {project && <input type="hidden" name="workId" value={project.sourceDocument.workId} />}
        {project?.targetDocument && <input type="hidden" name="targetDocumentId" value={project.targetDocument.id} />}

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* ── Original column ── */}
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
                placeholder="e.g., 大般若波羅蜜多經"
                className={textareaClass(bg)}
                defaultValue={project?.sourceDocument.title ?? ''}
              />
            </div>
            <div>
              <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">Subtitle</label>
              <textarea
                rows={2}
                name="originSubtitle"
                className={textareaClass(bg)}
                placeholder="Optional subtitle"
                defaultValue={project?.sourceDocument.subtitle ?? ''}
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
                defaultValue={project?.sourceDocument.language}
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>
            {project?.sourceDocument && <ContributorsField label="Contributors" document={project.sourceDocument} />}
          </div>

          {/* ── Translation column ── */}
          <div className="space-y-3">
            <p className="text-primary-foreground/70 text-xs font-semibold tracking-wider uppercase">Translation</p>
            <div>
              <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">Title</label>
              <textarea
                rows={2}
                name="translationTitle"
                className={textareaClass(bg)}
                placeholder="e.g., The Great Prajnaparamita Sutra"
                defaultValue={project?.targetDocument?.title ?? ''}
              />
            </div>
            <div>
              <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">Subtitle</label>
              <textarea
                rows={2}
                name="translationSubtitle"
                className={textareaClass(bg)}
                placeholder="Optional subtitle"
                defaultValue={project?.targetDocument?.subtitle ?? ''}
              />
            </div>
            <div>
              <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">Language</label>
              <select
                name="translationLang"
                className={selectClass(bg)}
                defaultValue={project?.targetDocument?.language}
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>
            {project?.targetDocument && <ContributorsField label="Contributors" document={project.targetDocument} />}
          </div>
        </div>

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
            {isSubmitting ? 'Saving…' : project ? 'Update' : 'Create'}
          </button>
        </div>
      </fetcher.Form>
    </div>
  );
}
