import { Pencil } from 'lucide-react';

import { DeleteEntityButton } from './DeleteEntityButton';
import { DocumentForm } from './DocumentForm';

type Contributor = { id: string; name: string; role: string };

type Document = {
  id: string;
  workId: string;
  key: string | null;
  title: string;
  subtitle: string | null;
  language: string;
  contributors: Contributor[];
};

type Props = {
  document: Document;
  canDelete: boolean;
  isEditing: boolean;
  onEditToggle: () => void;
  onEditClose: () => void;
};

export function DocumentRow({ document, canDelete, isEditing, onEditToggle, onEditClose }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-foreground text-sm font-medium">{document.title}</span>
            <button
              type="button"
              title="Edit document"
              onClick={onEditToggle}
              className="text-muted-foreground hover:bg-secondary hover:text-secondary-foreground rounded p-0.5 transition"
            >
              <Pencil size={11} />
            </button>
            {canDelete && (
              <DeleteEntityButton
                size={11}
                id={document.id}
                entity="document"
                idName="documentId"
                label={document.title}
                intent="delete-document"
              />
            )}
          </div>
          {document.subtitle && <div className="text-muted-foreground text-xs">{document.subtitle}</div>}
          <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
            <span className="bg-muted rounded-full px-2 py-0.5">
              language=<span className="capitalize">{document.language}</span>
            </span>
            {document.key && (
              <span className="bg-muted rounded-full px-2 py-0.5">
                key=<span className="font-mono">{document.key}</span>
              </span>
            )}
            {document.contributors.length > 0 && (
              <span>{document.contributors.map((c) => `${c.name} (${c.role})`).join(', ')}</span>
            )}
          </div>
        </div>
      </div>

      {isEditing && (
        <div className="border-border border-t px-4 py-3">
          <DocumentForm
            onClose={onEditClose}
            workId={document.workId}
            document={{
              id: document.id,
              key: document.key,
              title: document.title,
              subtitle: document.subtitle,
              language: document.language,
              contributors: document.contributors.map(({ name, role }) => ({ name, role })),
            }}
          />
        </div>
      )}
    </div>
  );
}
