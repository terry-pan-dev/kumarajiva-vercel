import type { DragControls } from 'framer-motion';

import { Download, FileText, GripVertical, Pencil, Upload } from 'lucide-react';

import { SectionForm, type ReferenceSectionForForm } from './SectionForm';

type Section = {
  id: string;
  title: string | null;
  order: number;
};

type Props = {
  section: Section;
  documentId: string;
  targetDocumentId: string;
  // The counterpart section in the target document (matched by order), when it
  // exists. Feeds both the "/ translation title" display and the edit form —
  // so edits update the real counterpart instead of creating a duplicate.
  targetSection?: { id: string; title: string | null } | null;
  // Each reference document's counterpart section (matched by order) for this
  // row — feeds the reference title boxes in the editor and the display line.
  references?: ReferenceSectionForForm[];
  // Whether the section has paragraph data (paragraphs_new); without data
  // there is nothing to export.
  hasData: boolean;
  isEditing: boolean;
  onEditToggle: () => void;
  onEditClose: () => void;
  dragControls?: DragControls;
};

export function SectionRow({
  section,
  documentId,
  targetDocumentId,
  targetSection,
  references = [],
  hasData,
  isEditing,
  onEditToggle,
  onEditClose,
  dragControls,
}: Props) {
  const targetTitle = targetSection?.title ?? null;
  const namedReferences = references.filter((r) => r.sectionId && r.title);

  return (
    <div>
      <div className="hover:bg-muted/50 flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            onPointerDown={(e) => dragControls?.start(e)}
            className="text-muted-foreground hover:text-foreground cursor-grab touch-none active:cursor-grabbing"
          >
            <GripVertical size={16} />
          </span>
          <FileText size={18} className="text-muted-foreground" />
          <div>
            <p className="text-foreground flex items-center gap-1.5 font-medium">
              {section.title}
              {targetTitle && <span className="text-muted-foreground font-normal">/ {targetTitle}</span>}
              <button
                type="button"
                title="Edit section"
                onClick={onEditToggle}
                className="text-muted-foreground hover:bg-secondary hover:text-secondary-foreground rounded p-0.5 transition"
              >
                <Pencil size={12} />
              </button>
            </p>
            {namedReferences.length > 0 && (
              <p className="text-muted-foreground mt-0.5 text-xs">
                {namedReferences.map((r) => `${r.label}: ${r.title}`).join(' · ')}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-row justify-end gap-5">
          <a
            target="_blank"
            rel="noreferrer"
            className="bg-accent text-accent-foreground hover:bg-accent/80 flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium"
            href={`/data/translation/import?originDocumentId=${documentId}&originSectionId=${section.id}&targetDocumentId=${targetDocumentId}`}
          >
            <Upload size={14} />
            Import & Replace
          </a>
          {hasData ? (
            <a
              target="_blank"
              rel="noreferrer"
              href={`/resources/export/${section.id}`}
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80 flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium"
            >
              <Download size={14} />
              Export xlsx
            </a>
          ) : (
            <span className="text-muted-foreground flex items-center gap-2 px-3 py-1.5 text-xs italic">
              No data to export
            </span>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="px-4 pb-4">
          <SectionForm
            onClose={onEditClose}
            documentId={documentId}
            references={references}
            targetDocumentId={targetDocumentId}
            section={{
              sectionId: section.id,
              childSectionId: targetSection?.id ?? null,
              originTitle: section.title ?? '',
              translationTitle: targetSection?.title ?? '',
            }}
          />
        </div>
      )}
    </div>
  );
}
