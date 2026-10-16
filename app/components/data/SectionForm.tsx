import { useFetcher } from '@remix-run/react';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { textareaClass } from './fieldClasses';

const bg = 'bg-background';

export type SectionForForm = {
  sectionId: string;
  childSectionId: string | null;
  originTitle: string;
  translationTitle: string;
};

// A reference document as it appears in the section editor: its counterpart
// section (matched by order) when it exists, and the title to seed the box.
export type ReferenceSectionForForm = {
  documentId: string;
  label: string;
  sectionId: string | null;
  title: string;
};

export function SectionForm({
  section,
  documentId,
  targetDocumentId,
  references = [],
  onClose,
}: {
  section?: SectionForForm;
  documentId: string;
  targetDocumentId?: string | null;
  references?: ReferenceSectionForForm[];
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ success: boolean }>();
  const isSubmitting = fetcher.state === 'submitting';
  const { t } = useTranslation(['data', 'common']);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) onClose();
  }, [fetcher.state, fetcher.data, onClose]);

  return (
    <div className="bg-primary text-primary-foreground rounded-lg p-5 shadow-lg">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-primary-foreground text-sm font-semibold">
          {t(section ? 'projects.section.editHeading' : 'projects.section.addHeading')}
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
            <p className="text-primary-foreground/70 text-xs font-semibold tracking-wider uppercase">
              {t('projects.section.original')}
            </p>
            <div>
              <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">
                {t('projects.section.title')} <span className="text-destructive">*</span>
              </label>
              <textarea
                required
                rows={2}
                name="originTitle"
                className={textareaClass(bg)}
                defaultValue={section?.originTitle ?? ''}
                placeholder={t('projects.section.originPlaceholder')}
              />
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-primary-foreground/70 text-xs font-semibold tracking-wider uppercase">
              {t('projects.section.translation')}
            </p>
            <div>
              <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">
                {t('projects.section.title')}
              </label>
              <textarea
                rows={2}
                name="translationTitle"
                className={textareaClass(bg)}
                defaultValue={section?.translationTitle ?? ''}
                placeholder={t('projects.section.translationPlaceholder')}
              />
            </div>
          </div>
        </div>

        {references.length > 0 && (
          <div className="border-primary-foreground/20 space-y-3 border-t pt-4">
            <p className="text-primary-foreground/70 text-xs font-semibold tracking-wider uppercase">
              {t('projects.section.references')}
            </p>
            <p className="text-primary-foreground/60 text-xs">{t('projects.section.referencesHint')}</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {references.map((ref) => (
                <div key={ref.documentId}>
                  {/* Aligned parallel inputs — read back with formData.getAll. */}
                  <input type="hidden" value={ref.documentId} name="referenceSectionDocumentId" />
                  <input type="hidden" name="referenceSectionId" value={ref.sectionId ?? ''} />
                  <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">{ref.label}</label>
                  <textarea
                    rows={2}
                    defaultValue={ref.title}
                    name="referenceSectionTitle"
                    className={textareaClass(bg)}
                    placeholder={t('projects.section.translationPlaceholder')}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

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
              : t(section ? 'projects.section.update' : 'projects.section.create')}
          </button>
        </div>
      </fetcher.Form>
    </div>
  );
}
