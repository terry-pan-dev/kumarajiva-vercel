import { useFetcher, useLoaderData, useRouteError } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { ChevronRight, Download, FileText, Pencil, Plus, Upload, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { Lang } from '~/utils/constants';

import { assertAuthUser } from '~/auth.server';
import { ErrorInfo } from '~/components/ErrorInfo';
import { createRoll, updateRoll } from '~/services/roll.service';
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

type RollForForm = {
  id: string;
  title: string;
  subtitle: string;
  children?: { id: string; title: string; subtitle: string } | null;
};

// ─── Action ─────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');

  const formData = await request.formData();
  const intent = formData.get('intent') as string;

  // ── Sutra: create ──
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

  // ── Sutra: update ──
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

  // ── Roll: create ──
  if (intent === 'create-roll') {
    const sutraId = formData.get('sutraId') as string;
    const childSutraId = formData.get('childSutraId') as string | null;
    const originTitle = formData.get('originTitle') as string;
    const originSubtitle = (formData.get('originSubtitle') as string) || '';
    const translationTitle = formData.get('translationTitle') as string;
    const translationSubtitle = (formData.get('translationSubtitle') as string) || '';

    const [created] = await createRoll({ title: originTitle, subtitle: originSubtitle, sutraId }, user);

    if (childSutraId && translationTitle) {
      await createRoll(
        { title: translationTitle, subtitle: translationSubtitle, sutraId: childSutraId, parentId: created.id },
        user,
      );
    }

    return json({ success: true });
  }

  // ── Roll: update ──
  if (intent === 'update-roll') {
    const rollId = formData.get('rollId') as string;
    const childRollId = formData.get('childRollId') as string | null;
    const childSutraId = formData.get('childSutraId') as string | null;
    const originTitle = formData.get('originTitle') as string;
    const originSubtitle = (formData.get('originSubtitle') as string) || '';
    const translationTitle = formData.get('translationTitle') as string;
    const translationSubtitle = (formData.get('translationSubtitle') as string) || '';

    await updateRoll(rollId, { title: originTitle, subtitle: originSubtitle }, user);

    if (translationTitle) {
      if (childRollId) {
        await updateRoll(childRollId, { title: translationTitle, subtitle: translationSubtitle }, user);
      } else if (childSutraId) {
        await createRoll(
          { title: translationTitle, subtitle: translationSubtitle, sutraId: childSutraId, parentId: rollId },
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

// ─── Shared field classes ────────────────────────────────────────────────────

const textareaClass = (bg: string) =>
  `w-full resize-y rounded ${bg} px-3 py-2 text-sm text-foreground placeholder-muted-foreground ring-1 ring-input focus:outline-none focus:ring-2 focus:ring-ring`;

const inputClass = (bg: string) =>
  `w-full rounded ${bg} px-3 py-2 text-sm text-foreground placeholder-muted-foreground ring-1 ring-input focus:outline-none focus:ring-2 focus:ring-ring`;

const selectClass = (bg: string) =>
  `w-full rounded ${bg} px-3 py-2 text-sm text-foreground ring-1 ring-input focus:outline-none focus:ring-2 focus:ring-ring`;

// ─── SutraForm ───────────────────────────────────────────────────────────────

function SutraForm({ sutra, onClose }: { sutra?: SutraForForm; onClose: () => void }) {
  const fetcher = useFetcher<{ success: boolean }>();
  const isSubmitting = fetcher.state === 'submitting';
  const bg = 'bg-background';

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

// ─── RollForm ─────────────────────────────────────────────────────────────────

function RollForm({
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
  const bg = 'bg-background';

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

// ─── Main Component ──────────────────────────────────────────────────────────

export default function DataManagementIndex() {
  const { sutras } = useLoaderData<typeof loader>();
  const [showAddSutraForm, setShowAddSutraForm] = useState(false);
  const [editingSutraId, setEditingSutraId] = useState<string | null>(null);
  const [addingRollToSutraId, setAddingRollToSutraId] = useState<string | null>(null);
  const [editingRollId, setEditingRollId] = useState<string | null>(null);

  return (
    <div className="container mx-auto max-w-5xl p-6">
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Data Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">Import translations, export data from rolls to Excel.</p>
        </div>
        <button
          type="button"
          title="Add new sutra"
          onClick={() => {
            setShowAddSutraForm((v) => !v);
            setEditingSutraId(null);
          }}
          className="flex items-center gap-1.5 rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/80"
        >
          <Plus size={16} />
          Add Sutra
        </button>
      </div>

      {/* Add-sutra form */}
      {showAddSutraForm && (
        <div className="mb-6">
          <SutraForm onClose={() => setShowAddSutraForm(false)} />
        </div>
      )}

      {/* Sutra list */}
      <div className="space-y-4">
        {sutras.map((sutra) => {
          const isEditingSutra = editingSutraId === sutra.id;
          const isAddingRoll = addingRollToSutraId === sutra.id;
          const childSutraId = sutra.children?.id ?? null;

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
            <div key={sutra.id} className="overflow-hidden rounded-lg border border-border bg-background shadow-sm">
              <details className="group">
                <summary className="flex cursor-pointer items-center justify-between bg-muted p-4 transition hover:bg-muted/80">
                  {/* Left: chevron + title + edit pencil */}
                  <div className="flex items-center gap-3">
                    <div className="text-muted-foreground transition-transform group-open:rotate-90">
                      <ChevronRight size={20} />
                    </div>
                    <div>
                      <h3 className="flex items-center gap-1.5 text-lg font-semibold text-foreground">
                        {sutra.title} {sutra.children?.title}
                        <button
                          type="button"
                          title="Edit sutra"
                          className="rounded p-1 text-muted-foreground transition hover:bg-secondary hover:text-secondary-foreground"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setEditingSutraId(isEditingSutra ? null : sutra.id);
                            setShowAddSutraForm(false);
                          }}
                        >
                          <Pencil size={13} />
                        </button>
                      </h3>
                      <div className="text-xs text-muted-foreground">
                        {sutra.rolls?.length || 0} Rolls • {sutra.category}
                      </div>
                    </div>
                  </div>

                  {/* Right: Add Roll button — only visible when expanded */}
                  <button
                    type="button"
                    title="Add roll"
                    className="hidden items-center gap-1.5 rounded bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/80 group-open:flex"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setAddingRollToSutraId(isAddingRoll ? null : sutra.id);
                      setEditingRollId(null);
                    }}
                  >
                    <Plus size={13} />
                    Add Roll
                  </button>
                </summary>

                {/* Edit-sutra form */}
                {isEditingSutra && (
                  <div className="p-4 pt-0">
                    <SutraForm sutra={sutraForForm} onClose={() => setEditingSutraId(null)} />
                  </div>
                )}

                {/* Rolls list */}
                <div className="divide-y divide-border border-t border-border">
                  {sutra.rolls && sutra.rolls.length > 0 ? (
                    sutra.rolls.map((roll) => {
                      const isEditingRoll = editingRollId === roll.id;
                      const rollForForm: RollForForm = {
                        id: roll.id,
                        title: roll.title,
                        subtitle: roll.subtitle,
                        children: roll.children
                          ? { id: roll.children.id, title: roll.children.title, subtitle: roll.children.subtitle }
                          : null,
                      };

                      return (
                        <div key={roll.id}>
                          <div className="flex items-center justify-between p-4 hover:bg-muted/50">
                            <div className="flex items-center gap-3">
                              <FileText size={18} className="text-muted-foreground" />
                              <div>
                                <p className="flex items-center gap-1.5 font-medium text-foreground">
                                  {roll.title} {roll.children?.title}
                                  <button
                                    type="button"
                                    title="Edit roll"
                                    className="rounded p-0.5 text-muted-foreground transition hover:bg-secondary hover:text-secondary-foreground"
                                    onClick={() => {
                                      setEditingRollId(isEditingRoll ? null : roll.id);
                                      setAddingRollToSutraId(null);
                                    }}
                                  >
                                    <Pencil size={12} />
                                  </button>
                                </p>
                                {roll.subtitle && <p className="text-xs text-muted-foreground">{roll.subtitle}</p>}
                              </div>
                            </div>
                            <div className="flex flex-row justify-end gap-5">
                              <a
                                target="_blank"
                                rel="noreferrer"
                                href={`/data/import?sutraId=${sutra.id}&rollId=${roll.id}`}
                                className="flex items-center gap-2 rounded bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent/80"
                              >
                                <Upload size={14} />
                                Import & Replace
                              </a>
                              <a
                                target="_blank"
                                rel="noreferrer"
                                href={`/resources/export/${roll.id}`}
                                className="flex items-center gap-2 rounded bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
                              >
                                <Download size={14} />
                                Export xlsx
                              </a>
                            </div>
                          </div>

                          {/* Edit-roll form */}
                          {isEditingRoll && (
                            <div className="px-4 pb-4">
                              <RollForm
                                roll={rollForForm}
                                sutraId={sutra.id}
                                childSutraId={childSutraId}
                                onClose={() => setEditingRollId(null)}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-4 text-center text-sm text-muted-foreground">No rolls found for this sutra.</div>
                  )}
                </div>
              </details>

              {/* Add-roll form */}
              {isAddingRoll && (
                <div className="border-t border-border p-4">
                  <RollForm
                    sutraId={sutra.id}
                    childSutraId={childSutraId}
                    onClose={() => setAddingRollToSutraId(null)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
