import type { DragControls } from 'framer-motion';

import { Download, FileText, GripVertical, Pencil, Upload } from 'lucide-react';

import { SectionForm } from './SectionForm';

type Section = {
  id: string;
  title: string | null;
  order: number;
};

type Props = {
  section: Section;
  documentId: string;
  targetDocumentId: string;
  isEditing: boolean;
  onEditToggle: () => void;
  onEditClose: () => void;
  dragControls?: DragControls;
};

export function SectionRow({
  section,
  documentId,
  targetDocumentId,
  isEditing,
  onEditToggle,
  onEditClose,
  dragControls,
}: Props) {
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
              <button
                type="button"
                title="Edit section"
                onClick={onEditToggle}
                className="text-muted-foreground hover:bg-secondary hover:text-secondary-foreground rounded p-0.5 transition"
              >
                <Pencil size={12} />
              </button>
            </p>
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
          <a
            target="_blank"
            rel="noreferrer"
            href={`/resources/export/${section.id}`}
            className="bg-secondary text-secondary-foreground hover:bg-secondary/80 flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium"
          >
            <Download size={14} />
            Export xlsx
          </a>
        </div>
      </div>

      {isEditing && (
        <div className="px-4 pb-4">
          <SectionForm
            onClose={onEditClose}
            documentId={documentId}
            targetDocumentId={targetDocumentId}
            section={{
              sectionId: section.id,
              childSectionId: null,
              originTitle: section.title ?? '',
              translationTitle: '',
            }}
          />
        </div>
      )}
    </div>
  );
}
