import { useLoaderData, useRouteError } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import type { Lang } from '~/utils/constants';

import { assertAuthUser } from '~/auth.server';
import { defineAbilityFor } from '~/authorisation';
import { ProjectForm } from '~/components/data/ProjectForm';
import { ProjectRow } from '~/components/data/ProjectRow';
import { ErrorInfo } from '~/components/ErrorInfo';
import {
  createProject,
  deleteProject,
  getProjects,
  syncProjectReferences,
  updateProject,
} from '~/services/project.service';
import { DbContributors } from '~/services/text.crud';
import {
  createDocument,
  createSection,
  getSection,
  getSectionIdsWithParagraphs,
  getSectionsByDocument,
  getWorks,
  reorderSections,
  updateSection,
} from '~/services/text.service';
import { LANG_VALUES } from '~/utils/constants';
import { parseContributors } from '~/utils/contributors';

// ─── Action ─────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');

  const formData = await request.formData();
  const intent = formData.get('intent') as string;

  // ── Section: create ──
  if (intent === 'create-section') {
    const documentId = formData.get('documentId') as string;
    const targetDocumentId = (formData.get('targetDocumentId') as string) || null;
    const originTitle = formData.get('originTitle') as string;
    const translationTitle = (formData.get('translationTitle') as string) || '';

    const existingSections = await getSectionsByDocument(documentId);
    const nextOrder = existingSections.length + 1;

    await createSection({ documentId, title: originTitle, order: nextOrder }, user);

    if (targetDocumentId && translationTitle) {
      // The counterpart gets the SAME order as the source section — order is
      // how the two sides are paired everywhere (display, import, workspace).
      await createSection(
        {
          documentId: targetDocumentId,
          title: translationTitle,
          order: nextOrder,
        },
        user,
      );
    }

    // Reference documents are aligned the same way — a section per reference at
    // the SAME order, created only for references given a title.
    const refDocumentIds = formData.getAll('referenceSectionDocumentId') as string[];
    const refTitles = formData.getAll('referenceSectionTitle') as string[];
    for (let i = 0; i < refDocumentIds.length; i++) {
      const title = (refTitles[i] ?? '').trim();
      if (refDocumentIds[i] && title) {
        await createSection({ documentId: refDocumentIds[i], title, order: nextOrder }, user);
      }
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

    // The source section's order pairs every counterpart (translation and each
    // reference), so fetch it once for any counterpart we may need to create.
    const sourceSection = await getSection(sectionId);
    if (!sourceSection) {
      return json({ success: false, error: 'Section not found' }, { status: 404 });
    }

    if (translationTitle) {
      if (childSectionId) {
        await updateSection(childSectionId, { title: translationTitle }, user);
      } else if (targetDocumentId) {
        // No counterpart yet — create it with the SAME order as the source
        // section, since order is how the two sides are paired everywhere.
        await createSection(
          { documentId: targetDocumentId, title: translationTitle, order: sourceSection.order },
          user,
        );
      }
    }

    // References: upsert each reference document's counterpart section at this
    // section's order — update it when it already exists, create it otherwise.
    const refDocumentIds = formData.getAll('referenceSectionDocumentId') as string[];
    const refSectionIds = formData.getAll('referenceSectionId') as string[];
    const refTitles = formData.getAll('referenceSectionTitle') as string[];
    for (let i = 0; i < refDocumentIds.length; i++) {
      const title = (refTitles[i] ?? '').trim();
      const refSectionId = refSectionIds[i] || null;
      if (refSectionId) {
        if (title) await updateSection(refSectionId, { title }, user);
      } else if (refDocumentIds[i] && title) {
        await createSection({ documentId: refDocumentIds[i], title, order: sourceSection.order }, user);
      }
    }

    return json({ success: true });
  }

  // ── Document: create (inline "new document" panel in ProjectForm) ──
  if (intent === 'create-document') {
    const workId = formData.get('workId') as string;
    const key = ((formData.get('key') as string) ?? '').trim() || null;
    const title = (formData.get('title') as string).trim();
    const subtitle = ((formData.get('subtitle') as string) ?? '').trim() || null;
    const language = formData.get('language') as string;

    if (!LANG_VALUES.includes(language as Lang)) {
      return json({ success: false, error: 'Invalid language' }, { status: 400 });
    }

    try {
      const [created] = await createDocument({ workId, key, title, subtitle, language: language as Lang }, user);

      const contributors = parseContributors(formData);
      if (contributors.length) {
        await DbContributors.createMany(contributors.map((c) => ({ ...c, documentId: created.id })));
      }

      return json({ success: true });
    } catch (error) {
      return json({ success: false, error: (error as Error).message }, { status: 400 });
    }
  }

  // ── Project: create from two existing documents of one work ──
  if (intent === 'create-project') {
    const sourceDocumentId = formData.get('sourceDocumentId') as string;
    const targetDocumentId = formData.get('targetDocumentId') as string;
    const name = (formData.get('name') as string) || '';
    // Reference documents the project consults, e.g. earlier renderings or
    // commentaries — sent as one hidden input per picked document.
    const referenceDocumentIds = formData.getAll('referenceDocumentId') as string[];

    const [created] = await createProject(
      { name, sourceDocumentId, targetDocumentId, teamId: user.teamId, finish: false },
      user,
    );

    if (referenceDocumentIds.length) {
      await syncProjectReferences({ projectId: created.id, documentIds: referenceDocumentIds });
    }

    return json({ success: true });
  }

  // ── Project: update name / documents / references ──
  if (intent === 'update-project') {
    const projectId = formData.get('projectId') as string;
    const sourceDocumentId = formData.get('sourceDocumentId') as string;
    const targetDocumentId = formData.get('targetDocumentId') as string;
    const name = (formData.get('name') as string) || '';
    const referenceDocumentIds = formData.getAll('referenceDocumentId') as string[];

    try {
      await updateProject(projectId, { name, sourceDocumentId, targetDocumentId }, user);
      await syncProjectReferences({ projectId, documentIds: referenceDocumentIds });
      return json({ success: true });
    } catch (error) {
      return json({ success: false, error: (error as Error).message }, { status: 400 });
    }
  }

  // ── Project: delete ──
  if (intent === 'delete-project') {
    if (defineAbilityFor(user).cannot('Delete', 'DataManagement')) {
      return json({ success: false, error: 'You are not authorised to delete projects.' }, { status: 403 });
    }
    const projectId = formData.get('projectId') as string;
    try {
      await deleteProject({ id: projectId });
      return json({ success: true, message: 'Project deleted.' });
    } catch (error) {
      return json({ success: false, error: (error as Error).message }, { status: 400 });
    }
  }

  // ── Sections: reorder ──
  if (intent === 'reorder-sections') {
    const sectionsJson = formData.get('sections') as string;
    const sections = JSON.parse(sectionsJson) as Array<{ id: string; order: number }>;
    await reorderSections(sections, user);
    return json({ success: true });
  }

  return json({ success: false, error: 'Unknown intent' }, { status: 400 });
};

// ─── Loader ─────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');

  try {
    const [projects, works] = await Promise.all([getProjects(), getWorks()]);

    // Which sections have paragraph data (paragraphs_new) — sections without
    // data show "No data to export" instead of an export link.
    const sectionIds = projects.flatMap((p) =>
      (p.sourceDocument?.sections ?? []).flatMap((s) => [s.id, ...s.children.map((c) => c.id)]),
    );
    const sectionIdsWithData = await getSectionIdsWithParagraphs(sectionIds);

    return json({
      success: true,
      projects,
      works,
      sectionIdsWithData,
      canDelete: defineAbilityFor(user).can('Delete', 'DataManagement'),
    });
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
  const { projects, works, sectionIdsWithData, canDelete } = useLoaderData<typeof loader>();
  const sectionsWithData = new Set(sectionIdsWithData);
  const [showAddProjectForm, setShowAddProjectForm] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [addingSectionToProjectId, setAddingSectionToProjectId] = useState<string | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);

  return (
    <div className="container mx-auto max-w-5xl p-6">
      {/* Page header */}
      <div className="border-border mb-6 flex items-start justify-between border-b pb-4">
        <div>
          <h1 className="text-foreground text-2xl font-bold">Manage the data for translations</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Import translations, export data from sections to Excel, edit project and section metadata.
          </p>
        </div>
        <button
          type="button"
          title="Add new project"
          onClick={() => {
            setShowAddProjectForm((v) => !v);
            setEditingProjectId(null);
          }}
          className="bg-primary text-primary-foreground hover:bg-primary/80 flex items-center gap-1.5 rounded px-3 py-2 text-sm font-medium transition"
        >
          <Plus size={16} />
          Add Project
        </button>
      </div>

      {/* Add-project form */}
      {showAddProjectForm && (
        <div className="mb-6">
          <ProjectForm works={works} onClose={() => setShowAddProjectForm(false)} />
        </div>
      )}

      {/* Project list */}
      <div className="space-y-4">
        {projects.map((project) => (
          <ProjectRow
            works={works}
            key={project.id}
            project={project}
            canDelete={canDelete}
            sectionsWithData={sectionsWithData}
            editingSectionId={editingSectionId}
            isEditing={editingProjectId === project.id}
            onEditClose={() => setEditingProjectId(null)}
            onEditSectionClose={() => setEditingSectionId(null)}
            isAddingSection={addingSectionToProjectId === project.id}
            onAddSectionClose={() => setAddingSectionToProjectId(null)}
            onEditToggle={() => {
              setEditingProjectId((id) => (id === project.id ? null : project.id));
              setShowAddProjectForm(false);
            }}
            onAddSectionToggle={() => {
              setAddingSectionToProjectId((id) => (id === project.id ? null : project.id));
              setEditingSectionId(null);
            }}
            onEditSectionToggle={(sectionId) => {
              setEditingSectionId((id) => (id === sectionId ? null : sectionId));
              setAddingSectionToProjectId(null);
            }}
          />
        ))}
      </div>
    </div>
  );
}
