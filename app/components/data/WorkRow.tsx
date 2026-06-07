import { ChevronRight, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';

import { DocumentForm } from './DocumentForm';
import { DocumentRow } from './DocumentRow';
import { WorkForm } from './WorkForm';

type Contributor = { id: string; name: string; role: string };

type Document = {
  id: string;
  workId: string;
  title: string;
  subtitle: string | null;
  language: string;
  contributors: Contributor[];
};

type Work = {
  id: string;
  title: string;
  cbeta: string;
  category: string;
  passageKeyPrefix: string;
  documents: Document[];
};

type Props = {
  work: Work;
  isEditingWork: boolean;
  editingDocumentId: string | null;
  addingDocumentToWorkId: string | null;
  onEditWorkToggle: () => void;
  onEditWorkClose: () => void;
  onAddDocumentToggle: () => void;
  onAddDocumentClose: () => void;
  onEditDocumentToggle: (documentId: string) => void;
  onEditDocumentClose: () => void;
};

export function WorkRow({
  work,
  isEditingWork,
  editingDocumentId,
  addingDocumentToWorkId,
  onEditWorkToggle,
  onEditWorkClose,
  onAddDocumentToggle,
  onAddDocumentClose,
  onEditDocumentToggle,
  onEditDocumentClose,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);

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
              {work.title}
              <button
                type="button"
                title="Edit work"
                className="text-muted-foreground hover:bg-secondary hover:text-secondary-foreground rounded p-1 transition"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditWorkToggle();
                }}
              >
                <Pencil size={13} />
              </button>
            </h3>
            <div className="text-muted-foreground text-xs">
              {work.documents.length} {work.documents.length === 1 ? 'Document' : 'Documents'} • {work.cbeta} •{' '}
              {work.category}
            </div>
          </div>
        </div>

        {isOpen && (
          <button
            type="button"
            title="Add document"
            onClick={(e) => {
              e.stopPropagation();
              onAddDocumentToggle();
            }}
            className="bg-primary text-primary-foreground hover:bg-primary/80 flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition"
          >
            <Plus size={13} />
            Add Document
          </button>
        )}
      </div>

      {/* Edit-work form */}
      {isEditingWork && (
        <div className="border-border border-t p-4">
          <WorkForm
            onClose={onEditWorkClose}
            work={{
              id: work.id,
              title: work.title,
              cbeta: work.cbeta,
              category: work.category,
              passageKeyPrefix: work.passageKeyPrefix,
            }}
          />
        </div>
      )}

      {/* Documents list */}
      {isOpen && (
        <>
          <div className="divide-border border-border divide-y border-t">
            {work.documents.length > 0 ? (
              work.documents.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  document={doc}
                  onEditClose={onEditDocumentClose}
                  isEditing={editingDocumentId === doc.id}
                  onEditToggle={() => onEditDocumentToggle(doc.id)}
                />
              ))
            ) : (
              <div className="text-muted-foreground p-4 text-center text-sm">No documents found for this work.</div>
            )}
          </div>

          {/* Add-document form */}
          {addingDocumentToWorkId === work.id && (
            <div className="border-border border-t p-4">
              <DocumentForm workId={work.id} onClose={onAddDocumentClose} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
