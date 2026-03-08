import { useFetcher, useLoaderData, useRouteError } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { ChevronRight, Download, FileText, Pencil, Plus, Upload, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { Lang } from '~/utils/constants';

import { assertAuthUser } from '~/auth.server';
import { ErrorInfo } from '~/components/ErrorInfo';
import { createSutra, readSutrasAndRolls, updateSutra } from '~/services/sutra.service';
import { SUPPORTED_LANGUAGES } from '~/utils/constants';

// ─── Types ──────────────────────────────────────────────────────────────────

type SutraForForm = {
  id: string;
  title: string;
  subtitle?: string | null;
  language: string;
  category: string;
  translator: string;
  cbeta: string;
  children?: { id: string; title: string; subtitle?: string | null; language: string } | null;
};

// ─── Action ─────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');

  const formData = await request.formData();
  const intent = formData.get('intent') as string;

  if (intent === 'create') {
    const originTitle = formData.get('originTitle') as string;
    const originSubtitle = (formData.get('originSubtitle') as string) || null;
    const originLang = formData.get('originLang') as Lang;
    const translationTitle = formData.get('translationTitle') as string;
    const translationSubtitle = (formData.get('translationSubtitle') as string) || null;
    const translationLang = formData.get('translationLang') as Lang;
    const category = (formData.get('category') as string) || '';
    const translator = (formData.get('translator') as string) || '';
    const cbeta = (formData.get('cbeta') as string) || '';

    const [created] = await createSutra(
      {
        title: originTitle,
        subtitle: originSubtitle,
        language: originLang,
        category,
        translator,
        cbeta,
        teamId: user.teamId,
      },
      user,
    );

    if (translationTitle && translationLang) {
      await createSutra(
        {
          title: translationTitle,
          subtitle: translationSubtitle,
          language: translationLang,
          category,
          translator,
          cbeta,
          teamId: user.teamId,
          parentId: created.id,
        },
        user,
      );
    }

    return json({ success: true });
  }

  if (intent === 'update') {
    const sutraId = formData.get('sutraId') as string;
    const childSutraId = formData.get('childSutraId') as string | null;
    const originTitle = formData.get('originTitle') as string;
    const originSubtitle = (formData.get('originSubtitle') as string) || null;
    const originLang = formData.get('originLang') as Lang;
    const translationTitle = formData.get('translationTitle') as string;
    const translationSubtitle = (formData.get('translationSubtitle') as string) || null;
    const translationLang = formData.get('translationLang') as Lang;
    const category = (formData.get('category') as string) || '';
    const translator = (formData.get('translator') as string) || '';
    const cbeta = (formData.get('cbeta') as string) || '';

    await updateSutra(
      sutraId,
      { title: originTitle, subtitle: originSubtitle, language: originLang, category, translator, cbeta },
      user,
    );

    if (translationTitle && translationLang) {
      if (childSutraId) {
        await updateSutra(
          childSutraId,
          { title: translationTitle, subtitle: translationSubtitle, language: translationLang, category, translator },
          user,
        );
      } else {
        // No existing child — create one linked to the origin sutra
        await createSutra(
          {
            title: translationTitle,
            subtitle: translationSubtitle,
            language: translationLang,
            category,
            translator,
            cbeta,
            teamId: user.teamId,
            parentId: sutraId,
          },
          user,
        );
      }
    }

    return json({ success: true });
  }

  return json({ success: false, error: 'Unknown intent' }, { status: 400 });
};

// ─── Loader ─────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');

  try {
    const sutras = await readSutrasAndRolls({ user });
    return json({ success: true, sutras });
  } catch (error) {
    console.error(error);
    throw new Error('Internal Server Error');
  }
};

export const ErrorBoundary = () => {
  const error = useRouteError();
  return <ErrorInfo error={error} />;
};

// ─── SutraForm ───────────────────────────────────────────────────────────────

function SutraForm({ sutra, onClose }: { sutra?: SutraForForm; onClose: () => void }) {
  const fetcher = useFetcher<{ success: boolean }>();
  const isSubmitting = fetcher.state === 'submitting';

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) {
      onClose();
    }
  }, [fetcher.state, fetcher.data, onClose]);

  return (
    <div className="rounded-lg bg-gray-800 p-6 text-white shadow-xl">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-100">{sutra ? 'Edit Sutra' : 'Add New Sutra'}</h2>
        <button type="button" onClick={onClose} className="text-gray-400 transition hover:text-white">
          <X size={18} />
        </button>
      </div>

      <fetcher.Form method="post" className="space-y-4">
        <input type="hidden" name="intent" value={sutra ? 'update' : 'create'} />
        {sutra && <input type="hidden" name="sutraId" value={sutra.id} />}
        {sutra?.children && <input type="hidden" name="childSutraId" value={sutra.children.id} />}

        {/* Two-column layout: Original | Translation */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* ── Original column ── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Original</p>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">
                Title <span className="text-orange-400">*</span>
              </label>
              <textarea
                required
                rows={2}
                name="originTitle"
                defaultValue={sutra?.title}
                placeholder="e.g., 大般若波羅蜜多經"
                className="w-full resize-y rounded bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 ring-1 ring-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Subtitle</label>
              <textarea
                rows={2}
                name="originSubtitle"
                placeholder="Optional subtitle"
                defaultValue={sutra?.subtitle ?? ''}
                className="w-full resize-y rounded bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 ring-1 ring-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">
                Language <span className="text-orange-400">*</span>
              </label>
              <select
                required
                name="originLang"
                defaultValue={sutra?.language}
                className="w-full rounded bg-gray-700 px-3 py-2 text-sm text-white ring-1 ring-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
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
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Translation</p>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Title</label>
              <textarea
                rows={2}
                name="translationTitle"
                defaultValue={sutra?.children?.title ?? ''}
                placeholder="e.g., The Great Prajnaparamita Sutra"
                className="w-full resize-y rounded bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 ring-1 ring-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Subtitle</label>
              <textarea
                rows={2}
                name="translationSubtitle"
                placeholder="Optional subtitle"
                defaultValue={sutra?.children?.subtitle ?? ''}
                className="w-full resize-y rounded bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 ring-1 ring-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Language</label>
              <select
                name="translationLang"
                defaultValue={sutra?.children?.language ?? ''}
                className="w-full rounded bg-gray-700 px-3 py-2 text-sm text-white ring-1 ring-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Category</label>
            <input
              name="category"
              defaultValue={sutra?.category}
              placeholder="e.g., Prajnaparamita"
              className="w-full rounded bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 ring-1 ring-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Translator</label>
            <input
              name="translator"
              placeholder="e.g., Xuanzang"
              defaultValue={sutra?.translator}
              className="w-full rounded bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 ring-1 ring-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">CBETA Code</label>
            <input
              name="cbeta"
              placeholder="e.g., T0001"
              defaultValue={sutra?.cbeta}
              className="w-full rounded bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 ring-1 ring-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-4 py-2 text-sm text-gray-400 transition hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-600 disabled:opacity-50"
          >
            {isSubmitting ? 'Saving…' : sutra ? 'Update Sutra' : 'Create Sutra'}
          </button>
        </div>
      </fetcher.Form>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function DataManagementIndex() {
  const { sutras } = useLoaderData<typeof loader>();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingSutraId, setEditingSutraId] = useState<string | null>(null);

  return (
    <div className="container mx-auto max-w-5xl p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Management</h1>
          <p className="mt-1 text-sm text-gray-500">Import translations, export data from rolls to Excel.</p>
        </div>
        <button
          type="button"
          title="Add new sutra"
          onClick={() => {
            setShowAddForm((v) => !v);
            setEditingSutraId(null);
          }}
          className="flex items-center gap-1.5 rounded bg-gray-800 px-3 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
        >
          <Plus size={16} />
          Add Sutra
        </button>
      </div>

      {/* Add-sutra form */}
      {showAddForm && (
        <div className="mb-6">
          <SutraForm onClose={() => setShowAddForm(false)} />
        </div>
      )}

      {/* Sutra list */}
      <div className="space-y-4">
        {sutras.map((sutra) => {
          const isEditing = editingSutraId === sutra.id;
          const sutraForForm: SutraForForm = {
            id: sutra.id,
            title: sutra.title,
            subtitle: sutra.subtitle,
            language: sutra.language,
            category: sutra.category,
            translator: sutra.translator,
            cbeta: sutra.cbeta,
            children: sutra.children
              ? {
                  id: sutra.children.id,
                  title: sutra.children.title,
                  subtitle: sutra.children.subtitle,
                  language: sutra.children.language,
                }
              : null,
          };

          return (
            <div key={sutra.id} className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              {/* Native collapsible element */}
              <details className="group">
                <summary className="flex cursor-pointer items-center justify-between bg-gray-50 p-4 transition hover:bg-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="text-gray-400 transition-transform group-open:rotate-90">
                      <ChevronRight size={20} />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {sutra.title} {sutra.children?.title}
                      </h3>
                      <div className="text-xs text-gray-500">
                        {sutra.rolls?.length || 0} Rolls • {sutra.category}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    title="Edit sutra"
                    className="rounded p-1.5 text-gray-400 transition hover:bg-gray-200 hover:text-gray-700"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setEditingSutraId(isEditing ? null : sutra.id);
                      setShowAddForm(false);
                    }}
                  >
                    <Pencil size={15} />
                  </button>
                </summary>

                <div className="divide-y divide-gray-100 border-t border-gray-200">
                  {sutra.rolls && sutra.rolls.length > 0 ? (
                    sutra.rolls.map((roll) => (
                      <div key={roll.id} className="flex items-center justify-between p-4 hover:bg-gray-50">
                        <div className="flex items-center gap-3">
                          <FileText size={18} className="text-gray-400" />
                          <div>
                            <p className="font-medium text-gray-700">
                              {roll.title} {roll.children?.title}
                            </p>
                            {roll.subtitle && <p className="text-xs text-gray-500">{roll.subtitle}</p>}
                          </div>
                        </div>
                        <div className="flex flex-row justify-end gap-5">
                          <div className="flex items-center gap-3">
                            <a
                              target="_blank"
                              rel="noreferrer"
                              href={`/data/import?sutraId=${sutra.id}&rollId=${roll.id}`}
                              className="flex items-center gap-2 rounded bg-orange-50 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
                            >
                              <Upload size={14} />
                              Import & Replace
                            </a>
                          </div>
                          <div className="flex items-center gap-3">
                            <a
                              target="_blank"
                              rel="noreferrer"
                              href={`/resources/export/${roll.id}`}
                              className="flex items-center gap-2 rounded bg-gray-200 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
                            >
                              <Download size={14} />
                              Export xlsx
                            </a>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-sm text-gray-500">No rolls found for this sutra.</div>
                  )}
                </div>
              </details>

              {/* Edit form — shown below the collapsible, inside the card */}
              {isEditing && (
                <div className="p-4 pt-0">
                  <SutraForm sutra={sutraForForm} onClose={() => setEditingSutraId(null)} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
