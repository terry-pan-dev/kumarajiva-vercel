import { useFetcher } from '@remix-run/react';
import { Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CONTRIBUTOR_ROLE_VALUES, LANG_VALUES } from '~/utils/constants';

import { inputClass, selectClass, textareaClass } from './fieldClasses';

const bg = 'bg-background';

type Contributor = { name: string; role: string };

type DocumentForForm = {
  id: string;
  key: string | null;
  title: string;
  subtitle: string | null;
  language: string;
  contributors: Contributor[];
};

// Best-effort handle from a contributor's name: lowercased, non-alphanumerics
// collapsed to single hyphens. CJK names strip to '' — the user then types their
// own key, which is the point of it being a suggestion rather than derived.
const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function DocumentForm({
  workId,
  document,
  onClose,
}: {
  workId: string;
  document?: DocumentForForm;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ success: boolean; error?: string }>();
  const isSubmitting = fetcher.state === 'submitting';
  const { t } = useTranslation(['data', 'common']);
  const error = fetcher.state === 'idle' && fetcher.data && !fetcher.data.success ? fetcher.data.error : null;

  const [contributors, setContributors] = useState<Contributor[]>(
    document?.contributors.length ? document.contributors : [{ name: '', role: 'author' }],
  );

  // Key is user-owned once they touch it (or if the document already has one).
  // Until then it tracks a suggestion derived from the first contributor's name.
  const [key, setKey] = useState(document?.key ?? '');
  const [keyEdited, setKeyEdited] = useState(Boolean(document?.key));
  const suggestedKey = slugify(contributors[0]?.name ?? '');

  useEffect(() => {
    if (!keyEdited) setKey(suggestedKey);
  }, [suggestedKey, keyEdited]);

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
          {t(document ? 'documents.documentForm.editHeading' : 'documents.documentForm.addHeading')}
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
              {t('documents.documentForm.title')} <span className="text-destructive">*</span>
            </label>
            <textarea
              required
              rows={2}
              name="title"
              className={textareaClass(bg)}
              defaultValue={document?.title ?? ''}
              placeholder={t('documents.documentForm.titlePlaceholder')}
            />
          </div>
          <div>
            <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">
              {t('documents.documentForm.subtitle')}
            </label>
            <textarea
              rows={2}
              name="subtitle"
              className={textareaClass(bg)}
              defaultValue={document?.subtitle ?? ''}
              placeholder={t('documents.documentForm.subtitlePlaceholder')}
            />
          </div>
          <div>
            <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">
              {t('documents.documentForm.language')} <span className="text-destructive">*</span>
            </label>
            <select required name="language" className={selectClass(bg)} defaultValue={document?.language ?? 'chinese'}>
              {LANG_VALUES.map((lang) => (
                <option key={lang} value={lang}>
                  {t(`common:languages.${lang}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-primary-foreground/70 mb-1 block text-xs font-medium">
              {t('documents.documentForm.key')}
            </label>
            <input
              name="key"
              value={key}
              className={inputClass(bg)}
              placeholder={t('documents.documentForm.keyPlaceholder')}
              onChange={(e) => {
                setKey(e.target.value);
                setKeyEdited(true);
              }}
            />
            <p className="text-primary-foreground/50 mt-1 text-xs">{t('documents.documentForm.keyHint')}</p>
          </div>
        </div>

        <hr className="border-primary-foreground/20" />

        {/* Contributors */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-primary-foreground/70 text-xs font-semibold tracking-wider uppercase">
              {t('documents.documentForm.contributors')}
            </p>
            <button
              type="button"
              onClick={addContributor}
              className="text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground flex items-center gap-1 rounded px-2 py-1 text-xs transition"
            >
              <Plus size={12} />
              {t('common:actions.add')}
            </button>
          </div>
          <div className="space-y-3">
            {contributors.map((c, i) => (
              <div key={i} className="border-primary-foreground/15 space-y-2 rounded border p-3">
                <div className="flex items-start justify-between gap-2">
                  <label className="text-primary-foreground/70 block flex-1 text-xs font-medium">
                    {t('documents.documentForm.contributorName')}
                    <input
                      value={c.name}
                      className={inputClass(bg) + ' mt-1'}
                      onChange={(e) => updateContributor(i, 'name', e.target.value)}
                      placeholder={t('documents.documentForm.contributorNamePlaceholder')}
                    />
                  </label>
                  {contributors.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeContributor(i)}
                      title={t('documents.documentForm.removeContributorTooltip')}
                      className="text-primary-foreground/50 hover:text-primary-foreground mt-5 transition"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <label className="text-primary-foreground/70 block text-xs font-medium">
                  {t('documents.documentForm.contributorRole')}
                  <select
                    value={c.role}
                    className={selectClass(bg) + ' mt-1 w-40'}
                    onChange={(e) => updateContributor(i, 'role', e.target.value)}
                  >
                    {CONTRIBUTOR_ROLE_VALUES.map((role) => (
                      <option key={role} value={role}>
                        {t(`common:contributorRoles.${role}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-destructive text-xs">{error}</p>}

        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="text-primary-foreground/70 hover:text-primary-foreground rounded px-4 py-2 text-sm transition"
          >
            {t('common:actions.cancel')}
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-background text-foreground hover:bg-muted rounded px-4 py-2 text-sm font-medium transition disabled:opacity-50"
          >
            {isSubmitting
              ? t('common:actions.saving')
              : t(document ? 'documents.documentForm.update' : 'documents.documentForm.create')}
          </button>
        </div>
      </fetcher.Form>
    </div>
  );
}
