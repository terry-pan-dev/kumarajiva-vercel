import { useFetcher } from '@remix-run/react';
import { X } from 'lucide-react';
import { useEffect } from 'react';

import { inputClass } from './fieldClasses';

const bg = 'bg-background';

type WorkForForm = {
  id: string;
  title: string;
  cbeta: string;
  category: string;
  passageKeyPrefix: string;
};

export function WorkForm({ work, onClose }: { work?: WorkForForm; onClose: () => void }) {
  const fetcher = useFetcher<{ success: boolean }>();
  const isSubmitting = fetcher.state === 'submitting';

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) onClose();
  }, [fetcher.state, fetcher.data, onClose]);

  return (
    <div className="bg-primary text-primary-foreground rounded-lg p-5 shadow-xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-primary-foreground text-sm font-semibold">{work ? 'Edit Work' : 'Add New Work'}</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-primary-foreground/60 hover:text-primary-foreground transition"
        >
          <X size={16} />
        </button>
      </div>

      <fetcher.Form method="post" className="space-y-4">
        <input type="hidden" name="intent" value={work ? 'update-work' : 'create-work'} />
        {work && <input type="hidden" name="workId" value={work.id} />}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">
              Title <span className="text-destructive">*</span>
            </label>
            <input
              required
              name="title"
              className={inputClass(bg)}
              placeholder="e.g., 大般若波羅蜜多經"
              defaultValue={work?.title ?? ''}
            />
          </div>
          <div>
            <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">CBETA Code</label>
            <input name="cbeta" placeholder="e.g., T0220" className={inputClass(bg)} defaultValue={work?.cbeta ?? ''} />
          </div>
          <div>
            <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">
              Category <span className="text-destructive">*</span>
            </label>
            <input
              required
              name="category"
              className={inputClass(bg)}
              placeholder="e.g., Prajnaparamita"
              defaultValue={work?.category ?? ''}
            />
          </div>
          <div>
            <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">
              Passage Key Prefix <span className="text-destructive">*</span>
            </label>
            <input
              required
              name="passageKeyPrefix"
              placeholder="e.g., T0220"
              className={inputClass(bg)}
              defaultValue={work?.passageKeyPrefix ?? ''}
            />
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
            {isSubmitting ? 'Saving…' : work ? 'Update Work' : 'Create Work'}
          </button>
        </div>
      </fetcher.Form>
    </div>
  );
}
