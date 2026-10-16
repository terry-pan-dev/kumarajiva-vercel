import { useFetcher } from '@remix-run/react';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation(['data', 'common']);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) onClose();
  }, [fetcher.state, fetcher.data, onClose]);

  return (
    <div className="bg-primary text-primary-foreground rounded-lg p-5 shadow-xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-primary-foreground text-sm font-semibold">
          {t(work ? 'documents.workForm.editHeading' : 'documents.workForm.addHeading')}
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
        <input type="hidden" name="intent" value={work ? 'update-work' : 'create-work'} />
        {work && <input type="hidden" name="workId" value={work.id} />}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">
              {t('documents.workForm.title')} <span className="text-destructive">*</span>
            </label>
            <input
              required
              name="title"
              className={inputClass(bg)}
              defaultValue={work?.title ?? ''}
              placeholder={t('documents.workForm.titlePlaceholder')}
            />
          </div>
          <div>
            <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">
              {t('documents.workForm.cbeta')}
            </label>
            <input
              name="cbeta"
              className={inputClass(bg)}
              defaultValue={work?.cbeta ?? ''}
              placeholder={t('documents.workForm.cbetaPlaceholder')}
            />
          </div>
          <div>
            <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">
              {t('documents.workForm.category')} <span className="text-destructive">*</span>
            </label>
            <input
              required
              name="category"
              className={inputClass(bg)}
              defaultValue={work?.category ?? ''}
              placeholder={t('documents.workForm.categoryPlaceholder')}
            />
          </div>
          <div>
            <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">
              {t('documents.workForm.passageKeyPrefix')} <span className="text-destructive">*</span>
            </label>
            <input
              required
              name="passageKeyPrefix"
              className={inputClass(bg)}
              defaultValue={work?.passageKeyPrefix ?? ''}
              placeholder={t('documents.workForm.passageKeyPrefixPlaceholder')}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button
            type="reset"
            className="text-primary-foreground/70 hover:text-primary-foreground rounded px-4 py-2 text-sm transition"
          >
            {t('common:actions.reset')}
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-background text-foreground hover:bg-muted rounded px-4 py-2 text-sm font-medium transition disabled:opacity-50"
          >
            {isSubmitting
              ? t('common:actions.saving')
              : t(work ? 'documents.workForm.update' : 'documents.workForm.create')}
          </button>
        </div>
      </fetcher.Form>
    </div>
  );
}
