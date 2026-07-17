import { useFetcher } from '@remix-run/react';
import { Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { CONTRIBUTOR_ROLE_VALUES, SUPPORTED_LANGUAGES } from '~/utils/constants';

import { inputClass, selectClass, textareaClass } from './fieldClasses';

const bg = 'bg-background';

type Contributor = { name: string; role: string };

type DocumentForForm = {
  id: string;
  title: string;
  subtitle: string | null;
  language: string;
  contributors: Contributor[];
};

export function DocumentForm({
  workId,
  document,
  onClose,
}: {
  workId: string;
  document?: DocumentForForm;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ success: boolean }>();
  const isSubmitting = fetcher.state === 'submitting';

  const [contributors, setContributors] = useState<Contributor[]>(
    document?.contributors.length ? document.contributors : [{ name: '', role: 'author' }],
  );

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) onClose();
  }, [fetcher.state, fetcher.data, onClose]);

  const addContributor = () => setContributors((prev) => [...prev, { name: '', role: 'author' }]);
  const removeContributor = (i: number) => setContributors((prev) => prev.filter((_, idx) => idx !== i));
  const updateContributor = (i: number, field: keyof Contributor, value: string) =>
    setContributors((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));

  return (
    <div className="bg-primary text-primary-foreground rounded-lg p-5 shadow-xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-primary-foreground text-sm font-semibold">
          {document ? 'Edit Document' : 'Add New Document'}
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
        <input type="hidden" name="intent" value={document ? 'update-document' : 'create-document'} />
        <input type="hidden" name="workId" value={workId} />
        {document && <input type="hidden" name="documentId" value={document.id} />}
        <input type="hidden" name="contributorCount" value={contributors.length} />
        {contributors.map((c, i) => (
          <span key={i}>
            <input type="hidden" value={c.name} name={`contributorName_${i}`} />
            <input type="hidden" value={c.role} name={`contributorRole_${i}`} />
          </span>
        ))}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">
              Title <span className="text-destructive">*</span>
            </label>
            <textarea
              required
              rows={2}
              name="title"
              placeholder="e.g., 大般若波羅蜜多經"
              className={textareaClass(bg)}
              defaultValue={document?.title ?? ''}
            />
          </div>
          <div>
            <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">Subtitle</label>
            <textarea
              rows={2}
              name="subtitle"
              className={textareaClass(bg)}
              placeholder="Optional subtitle"
              defaultValue={document?.subtitle ?? ''}
            />
          </div>
          <div>
            <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">
              Language <span className="text-destructive">*</span>
            </label>
            <select required name="language" className={selectClass(bg)} defaultValue={document?.language ?? 'chinese'}>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <hr className="border-primary-foreground/20" />

        {/* Contributors */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-primary-foreground/70 text-xs font-semibold tracking-wider uppercase">Contributors</p>
            <button
              type="button"
              onClick={addContributor}
              className="text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground flex items-center gap-1 rounded px-2 py-1 text-xs transition"
            >
              <Plus size={12} />
              Add
            </button>
          </div>
          <div className="space-y-2">
            {contributors.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={c.name}
                  placeholder="Name"
                  className={inputClass(bg) + ' flex-1'}
                  onChange={(e) => updateContributor(i, 'name', e.target.value)}
                />
                <select
                  value={c.role}
                  className={selectClass(bg) + ' w-36'}
                  onChange={(e) => updateContributor(i, 'role', e.target.value)}
                >
                  {CONTRIBUTOR_ROLE_VALUES.map((role) => (
                    <option key={role} value={role}>
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </option>
                  ))}
                </select>
                {contributors.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeContributor(i)}
                    className="text-primary-foreground/50 hover:text-primary-foreground transition"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

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
            {isSubmitting ? 'Saving…' : document ? 'Update Document' : 'Create Document'}
          </button>
        </div>
      </fetcher.Form>
    </div>
  );
}
