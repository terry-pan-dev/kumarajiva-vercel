import { useFetcher } from '@remix-run/react';
import { X } from 'lucide-react';
import { useEffect } from 'react';

import { SUPPORTED_LANGUAGES } from '~/utils/constants';

import type { SutraForForm } from './types';

import { inputClass, selectClass, textareaClass } from './fieldClasses';

const bg = 'bg-background';

export function SutraForm({ sutra, onClose }: { sutra?: SutraForForm; onClose: () => void }) {
  const fetcher = useFetcher<{ success: boolean }>();
  const isSubmitting = fetcher.state === 'submitting';

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) onClose();
  }, [fetcher.state, fetcher.data, onClose]);

  return (
    <div className="rounded-lg bg-primary p-5 text-primary-foreground shadow-xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-primary-foreground">{sutra ? 'Edit Sutra' : 'Add New Sutra'}</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-primary-foreground/60 transition hover:text-primary-foreground"
        >
          <X size={16} />
        </button>
      </div>

      <fetcher.Form method="post" className="space-y-4">
        <input type="hidden" name="intent" value={sutra ? 'update' : 'create'} />
        {sutra && <input type="hidden" name="sutraId" value={sutra.id} />}
        {sutra?.children && <input type="hidden" name="childSutraId" value={sutra.children.id} />}

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
                placeholder="e.g., 大般若波羅蜜多經"
                className={textareaClass(bg)}
                defaultValue={sutra?.title ?? ''}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-primary-foreground/70">Subtitle</label>
              <textarea
                rows={2}
                name="originSubtitle"
                className={textareaClass(bg)}
                placeholder="Optional subtitle"
                defaultValue={sutra?.subtitle ?? ''}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-primary-foreground/70">
                Language <span className="text-destructive">*</span>
              </label>
              <select required name="originLang" className={selectClass(bg)} defaultValue={sutra?.language}>
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
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
                defaultValue={sutra?.children?.title ?? ''}
                placeholder="e.g., The Great Prajnaparamita Sutra"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-primary-foreground/70">Subtitle</label>
              <textarea
                rows={2}
                name="translationSubtitle"
                className={textareaClass(bg)}
                placeholder="Optional subtitle"
                defaultValue={sutra?.children?.subtitle ?? ''}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-primary-foreground/70">Language</label>
              <select name="translationLang" className={selectClass(bg)} defaultValue={sutra?.children?.language ?? ''}>
                <option value="">— none —</option>
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Metadata row */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-primary-foreground/70">Category</label>
            <input
              name="category"
              className={inputClass(bg)}
              defaultValue={sutra?.category}
              placeholder="e.g., Prajnaparamita"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-primary-foreground/70">Translator</label>
            <input
              name="translator"
              className={inputClass(bg)}
              placeholder="e.g., Xuanzang"
              defaultValue={sutra?.translator}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-primary-foreground/70">CBETA Code</label>
            <input name="cbeta" placeholder="e.g., T0001" className={inputClass(bg)} defaultValue={sutra?.cbeta} />
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
            {isSubmitting ? 'Saving…' : sutra ? 'Update Sutra' : 'Create Sutra'}
          </button>
        </div>
      </fetcher.Form>
    </div>
  );
}
