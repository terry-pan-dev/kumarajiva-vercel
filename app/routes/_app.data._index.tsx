import { useLoaderData, useRouteError } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { assertAuthUser } from '~/auth.server';
import { SutraForm } from '~/components/data/SutraForm';
import { SutraRow } from '~/components/data/SutraRow';
import { ErrorInfo } from '~/components/ErrorInfo';
import { getProjects } from '~/services/project.service';
import { createDocument, createSection, updateDocument, updateSection } from '~/services/text.service';

// ─── Action ─────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');

  const formData = await request.formData();
  const intent = formData.get('intent') as string;

  // ── Document: create ──
  if (intent === 'create') {
    const workId = formData.get('workId') as string;
    const originTitle = formData.get('originTitle') as string;
    const originSubtitle = (formData.get('originSubtitle') as string) || undefined;
    const originLang = formData.get('originLang') as string;
    const translationTitle = formData.get('translationTitle') as string;
    const translationSubtitle = (formData.get('translationSubtitle') as string) || undefined;
    const translationLang = formData.get('translationLang') as string;

    await createDocument({ workId, title: originTitle, subtitle: originSubtitle, language: originLang as never }, user);

    if (translationTitle && translationLang) {
      await createDocument(
        { workId, title: translationTitle, subtitle: translationSubtitle, language: translationLang as never },
        user,
      );
    }

    return json({ success: true });
  }

  // ── Document: update ──
  if (intent === 'update') {
    const documentId = formData.get('documentId') as string;
    const childDocumentId = (formData.get('childDocumentId') as string) || null;
    const workId = formData.get('workId') as string;
    const originTitle = formData.get('originTitle') as string;
    const originSubtitle = (formData.get('originSubtitle') as string) || undefined;
    const originLang = formData.get('originLang') as string;
    const translationTitle = formData.get('translationTitle') as string;
    const translationSubtitle = (formData.get('translationSubtitle') as string) || undefined;
    const translationLang = formData.get('translationLang') as string;

    await updateDocument(
      documentId,
      { title: originTitle, subtitle: originSubtitle, language: originLang as never },
      user,
    );

    if (translationTitle && translationLang) {
      if (childDocumentId) {
        await updateDocument(
          childDocumentId,
          { title: translationTitle, subtitle: translationSubtitle, language: translationLang as never },
          user,
        );
      } else {
        await createDocument(
          { workId, title: translationTitle, subtitle: translationSubtitle, language: translationLang as never },
          user,
        );
      }
    }

    return json({ success: true });
  }

  // ── Section: create ──
  if (intent === 'create-section') {
    const documentId = formData.get('documentId') as string;
    const targetDocumentId = (formData.get('targetDocumentId') as string) || null;
    const originTitle = formData.get('originTitle') as string;
    const translationTitle = (formData.get('translationTitle') as string) || '';

    const [created] = await createSection({ documentId, title: originTitle, order: 0 }, user);

    if (targetDocumentId && translationTitle) {
      await createSection(
        { documentId: targetDocumentId, title: translationTitle, order: 0, parentId: created.id },
        user,
      );
    }

    return json({ success: true });
  }

  // ── Section: update ──
  if (intent === 'update-section') {
    const sectionId = formData.get('sectionId') as string;
    const childSectionId = (formData.get('childSectionId') as string) || null;
    const targetDocumentId = (formData.get('targetDocumentId') as string) || null;
    const originTitle = formData.get('originTitle') as string;
    const translationTitle = (formData.get('translationTitle') as string) || '';

    await updateSection(sectionId, { title: originTitle }, user);

    if (translationTitle) {
      if (childSectionId) {
        await updateSection(childSectionId, { title: translationTitle }, user);
      } else if (targetDocumentId) {
        await createSection(
          { documentId: targetDocumentId, title: translationTitle, order: 0, parentId: sectionId },
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
    const projects = await getProjects();
    return json({ success: true, projects });
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
  const { projects } = useLoaderData<typeof loader>();
  const [showAddSutraForm, setShowAddSutraForm] = useState(false);
  const [editingSutraId, setEditingSutraId] = useState<string | null>(null);
  const [addingRollToSutraId, setAddingRollToSutraId] = useState<string | null>(null);
  const [editingRollId, setEditingRollId] = useState<string | null>(null);

  return (
    <div className="container mx-auto max-w-5xl p-6">
      {/* Page header */}
      <div className="border-border mb-6 flex items-start justify-between border-b pb-4">
        <div>
          <h1 className="text-foreground text-2xl font-bold">Manage the data for translations</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Import translations, export data from rolls to Excel, edit sutra and roll metadata.
          </p>
        </div>
        <button
          type="button"
          title="Add new sutra"
          onClick={() => {
            setShowAddSutraForm((v) => !v);
            setEditingSutraId(null);
          }}
          className="bg-primary text-primary-foreground hover:bg-primary/80 flex items-center gap-1.5 rounded px-3 py-2 text-sm font-medium transition"
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

      {/* Project list */}
      <div className="space-y-4">
        {projects.map((project) => (
          <SutraRow
            key={project.id}
            sutra={project as never}
            editingRollId={editingRollId}
            isEditingSutra={editingSutraId === project.id}
            onEditRollClose={() => setEditingRollId(null)}
            onEditSutraClose={() => setEditingSutraId(null)}
            isAddingRoll={addingRollToSutraId === project.id}
            onAddRollClose={() => setAddingRollToSutraId(null)}
            onEditRollToggle={(rollId) => {
              setEditingRollId((id) => (id === rollId ? null : rollId));
              setAddingRollToSutraId(null);
            }}
            onAddRollToggle={() => {
              setAddingRollToSutraId((id) => (id === project.id ? null : project.id));
              setEditingRollId(null);
            }}
            onEditSutraToggle={() => {
              setEditingSutraId((id) => (id === project.id ? null : project.id));
              setShowAddSutraForm(false);
            }}
          />
        ))}
      </div>
    </div>
  );
}
