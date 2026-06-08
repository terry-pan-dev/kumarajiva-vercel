import { useFetcher } from '@remix-run/react';
import { X } from 'lucide-react';
import { useEffect } from 'react';

import { textareaClass } from './fieldClasses';

const bg = 'bg-background';

export type SectionForForm = {
  sectionId: string;
  childSectionId: string | null;
  originTitle: string;
  translationTitle: string;
};

export function SectionForm({
  section,
  documentId,
  targetDocumentId,
  onClose,
}: {
  section?: SectionForForm;
  documentId: string;
  targetDocumentId?: string | null;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ success: boolean }>();
  const isSubmitting = fetcher.state === 'submitting';

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) onClose();
  }, [fetcher.state, fetcher.data, onClose]);

  return (
    <div className="bg-primary text-primary-foreground rounded-lg p-5 shadow-lg">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-primary-foreground text-sm font-semibold">
          {section ? 'Edit Section' : 'Add New Section'}
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
        <input type="hidden" name="intent" value={section ? 'update-section' : 'create-section'} />
        <input type="hidden" name="documentId" value={documentId} />
        {targetDocumentId && <input type="hidden" name="targetDocumentId" value={targetDocumentId} />}
        {section && <input type="hidden" name="sectionId" value={section.sectionId} />}
        {section?.childSectionId && <input type="hidden" name="childSectionId" value={section.childSectionId} />}

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
                placeholder="e.g., 卷一"
                className={textareaClass(bg)}
                defaultValue={section?.originTitle ?? ''}
              />
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
                placeholder="e.g., Volume One"
                defaultValue={section?.translationTitle ?? ''}
              />
            </div>
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
            {isSubmitting ? 'Saving…' : section ? 'Update Section' : 'Create Section'}
          </button>
        </div>
      </fetcher.Form>
    </div>
  );
}
