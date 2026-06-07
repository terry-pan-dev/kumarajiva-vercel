import { useLoaderData, useRouteError } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import type { ContributorRole, Lang } from '~/utils/constants';

import { assertAuthUser } from '~/auth.server';
import { WorkForm } from '~/components/data/WorkForm';
import { WorkRow } from '~/components/data/WorkRow';
import { ErrorInfo } from '~/components/ErrorInfo';
import { DbContributors } from '~/services/text.crud';
import { createDocument, createWork, getWorks, updateDocument, updateWork } from '~/services/text.service';
import { CONTRIBUTOR_ROLE_VALUES, LANG_VALUES } from '~/utils/constants';

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseContributors(formData: FormData) {
  const count = parseInt(formData.get('contributorCount') as string, 10) || 0;
  const contributors: { name: string; role: ContributorRole }[] = [];
  for (let i = 0; i < count; i++) {
    const name = (formData.get(`contributorName_${i}`) as string)?.trim();
    const role = formData.get(`contributorRole_${i}`) as string;
    if (name && CONTRIBUTOR_ROLE_VALUES.includes(role as ContributorRole)) {
      contributors.push({ name, role: role as ContributorRole });
    }
  }
  return contributors;
}

// ─── Action ─────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) return redirect('/login');

  const formData = await request.formData();
  const intent = formData.get('intent') as string;

  // ── Work: create ──
  if (intent === 'create-work') {
    const title = (formData.get('title') as string).trim();
    const cbeta = ((formData.get('cbeta') as string) ?? '').trim();
    const category = (formData.get('category') as string).trim();
    const passageKeyPrefix = (formData.get('passageKeyPrefix') as string).trim();

    await createWork({ title, cbeta, category, passageKeyPrefix }, user);
    return json({ success: true });
  }

  // ── Work: update ──
  if (intent === 'update-work') {
    const workId = formData.get('workId') as string;
    const title = (formData.get('title') as string).trim();
    const cbeta = ((formData.get('cbeta') as string) ?? '').trim();
    const category = (formData.get('category') as string).trim();
    const passageKeyPrefix = (formData.get('passageKeyPrefix') as string).trim();

    await updateWork(workId, { title, cbeta, category, passageKeyPrefix }, user);
    return json({ success: true });
  }

  // ── Document: create ──
  if (intent === 'create-document') {
    const workId = formData.get('workId') as string;
    const title = (formData.get('title') as string).trim();
    const subtitle = ((formData.get('subtitle') as string) ?? '').trim() || null;
    const language = formData.get('language') as string;

    if (!LANG_VALUES.includes(language as Lang)) {
      return json({ success: false, error: 'Invalid language' }, { status: 400 });
    }

    const [created] = await createDocument({ workId, title, subtitle, language: language as Lang }, user);

    const contributors = parseContributors(formData);
    if (contributors.length) {
      await DbContributors.createMany(contributors.map((c) => ({ ...c, documentId: created.id })));
    }

    return json({ success: true });
  }

  // ── Document: update ──
  if (intent === 'update-document') {
    const documentId = formData.get('documentId') as string;
    const title = (formData.get('title') as string).trim();
    const subtitle = ((formData.get('subtitle') as string) ?? '').trim() || null;
    const language = formData.get('language') as string;

    if (!LANG_VALUES.includes(language as Lang)) {
      return json({ success: false, error: 'Invalid language' }, { status: 400 });
    }

    await updateDocument(documentId, { title, subtitle, language: language as Lang }, user);

    const contributors = parseContributors(formData);
    await DbContributors.deleteByDocumentId(documentId);
    if (contributors.length) {
      await DbContributors.createMany(contributors.map((c) => ({ ...c, documentId })));
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
    const works = await getWorks();
    return json({ success: true, works });
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

export default function DocumentsPage() {
  const { works } = useLoaderData<typeof loader>();
  const [showAddWorkForm, setShowAddWorkForm] = useState(false);
  const [editingWorkId, setEditingWorkId] = useState<string | null>(null);
  const [addingDocumentToWorkId, setAddingDocumentToWorkId] = useState<string | null>(null);
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);

  return (
    <div className="container mx-auto max-w-5xl p-6">
      {/* Page header */}
      <div className="border-border mb-6 flex items-start justify-between border-b pb-4">
        <div>
          <h1 className="text-foreground text-2xl font-bold">Works & Documents</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage works and their language documents. Expand a work to view and add documents.
          </p>
        </div>
        <button
          type="button"
          title="Add new work"
          onClick={() => {
            setShowAddWorkForm((v) => !v);
            setEditingWorkId(null);
          }}
          className="bg-primary text-primary-foreground hover:bg-primary/80 flex items-center gap-1.5 rounded px-3 py-2 text-sm font-medium transition"
        >
          <Plus size={16} />
          Add Work
        </button>
      </div>

      {/* Add-work form */}
      {showAddWorkForm && (
        <div className="mb-6">
          <WorkForm onClose={() => setShowAddWorkForm(false)} />
        </div>
      )}

      {/* Works list */}
      <div className="space-y-4">
        {works.length === 0 && (
          <div className="border-border text-muted-foreground rounded-lg border p-8 text-center text-sm">
            No works found. Click "Add Work" to create the first one.
          </div>
        )}
        {works.map((work) => (
          <WorkRow
            work={work}
            key={work.id}
            editingDocumentId={editingDocumentId}
            isEditingWork={editingWorkId === work.id}
            onEditWorkClose={() => setEditingWorkId(null)}
            addingDocumentToWorkId={addingDocumentToWorkId}
            onEditDocumentClose={() => setEditingDocumentId(null)}
            onAddDocumentClose={() => setAddingDocumentToWorkId(null)}
            onEditWorkToggle={() => {
              setEditingWorkId((id) => (id === work.id ? null : work.id));
              setShowAddWorkForm(false);
            }}
            onAddDocumentToggle={() => {
              setAddingDocumentToWorkId((id) => (id === work.id ? null : work.id));
              setEditingDocumentId(null);
            }}
            onEditDocumentToggle={(docId) => {
              setEditingDocumentId((id) => (id === docId ? null : docId));
              setAddingDocumentToWorkId(null);
            }}
          />
        ))}
      </div>
    </div>
  );
}
