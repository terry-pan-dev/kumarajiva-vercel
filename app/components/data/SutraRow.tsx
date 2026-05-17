import { ChevronRight, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';

import type { ProjectForForm, SectionForForm } from './types';

import { RollForm } from './RollForm';
import { RollRow } from './RollRow';
import { SutraForm } from './SutraForm';

type Section = {
  id: string;
  title: string | null;
  children: { id: string; title: string | null }[];
};

type Document = {
  id: string;
  workId: string;
  title: string;
  subtitle: string | null;
  language: string;
  contributors: { id: string; name: string; role: string }[];
  sections: Section[];
};

type Project = {
  id: string;
  sourceDocument: Document;
  targetDocument: Document | null;
};

type Props = {
  project: Project;
  isEditingSutra: boolean;
  isAddingSection: boolean;
  editingSectionId: string | null;
  onEditSutraToggle: () => void;
  onEditSutraClose: () => void;
  onAddSectionToggle: () => void;
  onAddSectionClose: () => void;
  onEditSectionToggle: (sectionId: string) => void;
  onEditSectionClose: () => void;
};

export function SutraRow({
  project,
  isEditingSutra,
  isAddingSection,
  editingSectionId,
  onEditSutraToggle,
  onEditSutraClose,
  onAddSectionToggle,
  onAddSectionClose,
  onEditSectionToggle,
  onEditSectionClose,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);

  const projectForForm: ProjectForForm = {
    id: project.id,
    sourceDocument: {
      id: project.sourceDocument.id,
      workId: project.sourceDocument.workId,
      title: project.sourceDocument.title,
      subtitle: project.sourceDocument.subtitle ?? '',
      language: project.sourceDocument.language,
      contributors: project.sourceDocument.contributors,
    },
    targetDocument: project.targetDocument
      ? {
          id: project.targetDocument.id,
          workId: project.targetDocument.workId,
          title: project.targetDocument.title,
          subtitle: project.targetDocument.subtitle ?? '',
          language: project.targetDocument.language,
          contributors: project.targetDocument.contributors,
        }
      : null,
  };

  const sections: SectionForForm[] = project.sourceDocument.sections.map((section) => ({
    id: section.id,
    title: section.title ?? '',
    children: section.children?.[0] ? { id: section.children[0].id, title: section.children[0].title ?? '' } : null,
  }));

  return (
    <div className="border-border bg-background overflow-hidden rounded-lg border shadow-sm">
      {/* Header */}
      <div
        onClick={() => setIsOpen((v) => !v)}
        className="bg-muted hover:bg-muted/80 flex cursor-pointer items-center justify-between p-4 transition"
      >
        <div className="flex items-center gap-3">
          <div className={`text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`}>
            <ChevronRight size={20} />
          </div>
          <div>
            <h3 className="text-foreground flex items-center gap-1.5 text-lg font-semibold">
              {project.sourceDocument.title}
              {project.targetDocument?.title ? ` · ${project.targetDocument.title}` : ''}
              <button
                type="button"
                title="Edit project"
                className="text-muted-foreground hover:bg-secondary hover:text-secondary-foreground rounded p-1 transition"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditSutraToggle();
                }}
              >
                <Pencil size={13} />
              </button>
            </h3>
            <div className="text-muted-foreground text-xs">{project.sourceDocument.sections.length} Sections</div>
          </div>
        </div>

        {isOpen && (
          <button
            type="button"
            title="Add section"
            onClick={(e) => {
              e.stopPropagation();
              onAddSectionToggle();
            }}
            className="bg-primary text-primary-foreground hover:bg-primary/80 flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition"
          >
            <Plus size={13} />
            Add Section
          </button>
        )}
      </div>

      {isEditingSutra && (
        <div className="border-border border-t p-4">
          <SutraForm project={projectForForm} onClose={onEditSutraClose} />
        </div>
      )}

      {isOpen && (
        <>
          <div className="divide-border border-border divide-y border-t">
            {sections.length > 0 ? (
              sections.map((section) => (
                <RollRow
                  roll={section}
                  key={section.id}
                  onEditClose={onEditSectionClose}
                  isEditing={editingSectionId === section.id}
                  sourceDocumentId={project.sourceDocument.id}
                  onEditToggle={() => onEditSectionToggle(section.id)}
                  targetDocumentId={project.targetDocument?.id ?? null}
                />
              ))
            ) : (
              <div className="text-muted-foreground p-4 text-center text-sm">No sections found for this project.</div>
            )}
          </div>

          {isAddingSection && (
            <div className="border-border border-t p-4">
              <RollForm
                onClose={onAddSectionClose}
                sourceDocumentId={project.sourceDocument.id}
                targetDocumentId={project.targetDocument?.id ?? null}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
