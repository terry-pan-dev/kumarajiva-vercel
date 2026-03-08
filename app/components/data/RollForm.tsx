import { useFetcher } from '@remix-run/react';
import { X } from 'lucide-react';
import { useEffect } from 'react';

import type { RollForForm } from './types';

import { textareaClass } from './fieldClasses';

const bg = 'bg-background';

export function RollForm({
  roll,
  sutraId,
  childSutraId,
  onClose,
}: {
  roll?: RollForForm;
  sutraId: string;
  childSutraId?: string | null;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ success: boolean }>();
  const isSubmitting = fetcher.state === 'submitting';

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) onClose();
  }, [fetcher.state, fetcher.data, onClose]);

  return (
    <div className="rounded-lg bg-primary p-5 text-primary-foreground shadow-lg">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-primary-foreground">{roll ? 'Edit Roll' : 'Add New Roll'}</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-primary-foreground/60 transition hover:text-primary-foreground"
        >
          <X size={16} />
        </button>
      </div>

      <fetcher.Form method="post" className="space-y-4">
        <input type="hidden" name="intent" value={roll ? 'update-roll' : 'create-roll'} />
        <input type="hidden" name="sutraId" value={sutraId} />
        {childSutraId && <input type="hidden" name="childSutraId" value={childSutraId} />}
        {roll && <input type="hidden" name="rollId" value={roll.id} />}
        {roll?.children && <input type="hidden" name="childRollId" value={roll.children.id} />}

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* ── Original column ── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-foreground/70">Original</p>
            <div>
              <label className="mb-1 block text-xs font-medium text-primary-foreground/70">
                Title <span className="text-destructive">*</span>
              </label>
              <textarea
                required
                rows={2}
                name="originTitle"
                placeholder="e.g., 卷一"
                className={textareaClass(bg)}
                defaultValue={roll?.title ?? ''}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-primary-foreground/70">Subtitle</label>
              <textarea
                rows={2}
                name="originSubtitle"
                className={textareaClass(bg)}
                placeholder="Optional subtitle"
                defaultValue={roll?.subtitle ?? ''}
              />
            </div>
          </div>

          {/* ── Translation column ── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-foreground/70">Translation</p>
            <div>
              <label className="mb-1 block text-xs font-medium text-primary-foreground/70">Title</label>
              <textarea
                rows={2}
                name="translationTitle"
                className={textareaClass(bg)}
                placeholder="e.g., Volume One"
                defaultValue={roll?.children?.title ?? ''}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-primary-foreground/70">Subtitle</label>
              <textarea
                rows={2}
                name="translationSubtitle"
                className={textareaClass(bg)}
                placeholder="Optional subtitle"
                defaultValue={roll?.children?.subtitle ?? ''}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button
            type="reset"
            className="rounded px-4 py-2 text-sm text-primary-foreground/70 transition hover:text-primary-foreground"
          >
            Reset
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
          >
            {isSubmitting ? 'Saving…' : roll ? 'Update Roll' : 'Create Roll'}
          </button>
        </div>
      </fetcher.Form>
    </div>
  );
}
