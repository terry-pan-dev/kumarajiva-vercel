import { useFetcher } from '@remix-run/react';
import { Reorder, useDragControls } from 'framer-motion';
import { ChevronRight, Pencil, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { DeleteEntityButton } from './DeleteEntityButton';
import { ProjectForm, type ProjectForForm } from './ProjectForm';
import { SectionForm } from './SectionForm';
import { SectionRow } from './SectionRow';

type Section = {
  id: string;
  title: string | null;
  order: number;
};

type Document = {
  id: string;
  workId: string;
  title: string;
  subtitle: string | null;
  language: string;
  sections: Section[];
};

export type ProjectForRow = {
  id: string;
  name: string;
  sourceDocument: Document;
  targetDocument: Document;
};

type Props = {
  project: ProjectForRow;
  canDelete: boolean;
  // Sections that have paragraph data (paragraphs_new) — others show "No data
  // to export" instead of an export link.
  sectionsWithData: Set<string>;
  isEditing: boolean;
  isAddingSection: boolean;
  editingSectionId: string | null;
  onEditToggle: () => void;
  onEditClose: () => void;
  onAddSectionToggle: () => void;
  onAddSectionClose: () => void;
  onEditSectionToggle: (sectionId: string) => void;
  onEditSectionClose: () => void;
};

type DraggableItemProps = {
  section: Section;
  documentId: string;
  targetDocumentId: string;
  // The counterpart section in the target document (matched by order), when it
  // exists — its id/title feed the edit form so updates hit the real section.
  targetSection: { id: string; title: string | null } | null;
  hasData: boolean;
  isEditing: boolean;
  onEditToggle: () => void;
  onEditClose: () => void;
  onDragEnd: () => void;
};

function DraggableSectionRow({
  section,
  documentId,
  targetDocumentId,
  targetSection,
  hasData,
  isEditing,
  onEditToggle,
  onEditClose,
  onDragEnd,
}: DraggableItemProps) {
  const dragControls = useDragControls();
  return (
    <Reorder.Item
      as="div"
      value={section}
      dragListener={false}
      onDragEnd={onDragEnd}
      className="bg-background"
      dragControls={dragControls}
      whileDrag={{ boxShadow: '0 8px 20px rgba(0,0,0,0.12)', zIndex: 50, position: 'relative' }}
    >
      <SectionRow
        section={section}
        hasData={hasData}
        isEditing={isEditing}
        documentId={documentId}
        onEditClose={onEditClose}
        onEditToggle={onEditToggle}
        dragControls={dragControls}
        targetSection={targetSection}
        targetDocumentId={targetDocumentId}
      />
    </Reorder.Item>
  );
}

export function ProjectRow({
  project,
  canDelete,
  sectionsWithData,
  isEditing,
  isAddingSection,
  editingSectionId,
  onEditToggle,
  onEditClose,
  onAddSectionToggle,
  onAddSectionClose,
  onEditSectionToggle,
  onEditSectionClose,
}: Props) {
  const fetcher = useFetcher();
  const [isOpen, setIsOpen] = useState(false);
  const [sections, setSections] = useState(project.sourceDocument.sections);
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  useEffect(() => {
    setSections(project.sourceDocument.sections);
  }, [project.sourceDocument.sections]);

  const handleDragEnd = () => {
    const reordered = sectionsRef.current.map((s, i) => ({ id: s.id, order: i + 1 }));
    fetcher.submit({ intent: 'reorder-sections', sections: JSON.stringify(reordered) }, { method: 'post' });
  };

  const projectForForm: ProjectForForm = {
    sourceDocument: {
      id: project.sourceDocument.id,
      workId: project.sourceDocument.workId,
      title: project.sourceDocument.title,
      subtitle: project.sourceDocument.subtitle,
      language: project.sourceDocument.language,
    },
    targetDocument: {
      id: project.targetDocument.id,
      title: project.targetDocument.title,
      subtitle: project.targetDocument.subtitle,
      language: project.targetDocument.language,
    },
  };

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
              {project.name || 'Untitled project'}
              <button
                type="button"
                title="Edit project"
                className="text-muted-foreground hover:bg-secondary hover:text-secondary-foreground rounded p-1 transition"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditToggle();
                }}
              >
                <Pencil size={13} />
              </button>
              {canDelete && (
                <DeleteEntityButton
                  id={project.id}
                  entity="project"
                  idName="projectId"
                  intent="delete-project"
                  label={project.name || 'Untitled project'}
                  description={`This permanently deletes the project “${project.name || 'Untitled project'}”. It cannot be undone. The paired documents, their sections and paragraphs are kept — only the pairing is removed.`}
                />
              )}
            </h3>
            <div className="text-muted-foreground text-sm">
              {project.sourceDocument.title}
              {project.targetDocument.title && <span className="font-normal"> / {project.targetDocument.title}</span>}
            </div>
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

      {/* Edit-project form */}
      {isEditing && (
        <div className="border-border border-t p-4">
          <ProjectForm onClose={onEditClose} project={projectForForm} />
        </div>
      )}

      {/* Sections list */}
      {isOpen && (
        <>
          <Reorder.Group
            as="div"
            axis="y"
            values={sections}
            onReorder={setSections}
            className="divide-border border-border divide-y border-t"
          >
            {sections.length > 0 ? (
              (() => {
                const targetByOrder = new Map(
                  project.targetDocument.sections.map((s) => [s.order, { id: s.id, title: s.title }]),
                );
                return sections.map((section) => (
                  <DraggableSectionRow
                    key={section.id}
                    section={section}
                    onDragEnd={handleDragEnd}
                    onEditClose={onEditSectionClose}
                    documentId={project.sourceDocument.id}
                    hasData={sectionsWithData.has(section.id)}
                    isEditing={editingSectionId === section.id}
                    targetDocumentId={project.targetDocument.id}
                    onEditToggle={() => onEditSectionToggle(section.id)}
                    targetSection={targetByOrder.get(section.order) ?? null}
                  />
                ));
              })()
            ) : (
              <div className="text-muted-foreground p-4 text-center text-sm">No sections found for this project.</div>
            )}
          </Reorder.Group>

          {isAddingSection && (
            <div className="border-border border-t p-4">
              <SectionForm
                onClose={onAddSectionClose}
                documentId={project.sourceDocument.id}
                targetDocumentId={project.targetDocument.id}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
