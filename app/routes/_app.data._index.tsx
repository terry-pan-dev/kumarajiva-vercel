import { useLoaderData, useRouteError } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { assertAuthUser } from '~/auth.server';
import { SutraForm } from '~/components/data/SutraForm';
import { SutraRow } from '~/components/data/SutraRow';
import { ErrorInfo } from '~/components/ErrorInfo';
import { createRoll, updateRoll } from '~/services/roll.service';
import { createSutra, readSutrasAndRolls, updateSutra } from '~/services/sutra.service';
import { parseRollCreate, parseRollUpdate, parseSutraCreate, parseSutraUpdate } from '~/utils/dataFormParsers';

// ─── Action ─────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');

  const formData = await request.formData();
  const intent = formData.get('intent') as string;

  // ── Sutra: create ──
  if (intent === 'create') {
    const {
      originTitle,
      originSubtitle,
      originLang,
      translationTitle,
      translationSubtitle,
      translationLang,
      category,
      translator,
      cbeta,
    } = parseSutraCreate(formData);

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
    const {
      sutraId,
      childSutraId,
      originTitle,
      originSubtitle,
      originLang,
      translationTitle,
      translationSubtitle,
      translationLang,
      category,
      translator,
      cbeta,
    } = parseSutraUpdate(formData);

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
    const { sutraId, childSutraId, originTitle, originSubtitle, translationTitle, translationSubtitle } =
      parseRollCreate(formData);

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
    const { rollId, childRollId, childSutraId, originTitle, originSubtitle, translationTitle, translationSubtitle } =
      parseRollUpdate(formData);

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

// ─── Page ────────────────────────────────────────────────────────────────────

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
        {sutras.map((sutra) => (
          <SutraRow
            sutra={sutra}
            key={sutra.id}
            editingRollId={editingRollId}
            isEditingSutra={editingSutraId === sutra.id}
            onEditRollClose={() => setEditingRollId(null)}
            isAddingRoll={addingRollToSutraId === sutra.id}
            onEditSutraClose={() => setEditingSutraId(null)}
            onAddRollClose={() => setAddingRollToSutraId(null)}
            onAddRollToggle={() => {
              setAddingRollToSutraId((id) => (id === sutra.id ? null : sutra.id));
              setEditingRollId(null);
            }}
            onEditSutraToggle={() => {
              setEditingSutraId((id) => (id === sutra.id ? null : sutra.id));
              setShowAddSutraForm(false);
            }}
            onEditRollToggle={(rollId) => {
              setEditingRollId((id) => (id === rollId ? null : rollId));
              setAddingRollToSutraId(null);
            }}
          />
        ))}
      </div>
    </div>
  );
}
