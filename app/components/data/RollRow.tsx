import { Download, FileText, Pencil, Upload } from 'lucide-react';

import type { RollForForm } from './types';

import { RollForm } from './RollForm';

type Props = {
  roll: RollForForm;
  sutraId: string;
  childSutraId: string | null;
  isEditing: boolean;
  onEditToggle: () => void;
  onEditClose: () => void;
};

export function RollRow({ roll, sutraId, childSutraId, isEditing, onEditToggle, onEditClose }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between p-4 hover:bg-muted/50">
        <div className="flex items-center gap-3">
          <FileText size={18} className="text-muted-foreground" />
          <div>
            <p className="flex items-center gap-1.5 font-medium text-foreground">
              {roll.title} {roll.children?.title}
              <button
                type="button"
                title="Edit roll"
                onClick={onEditToggle}
                className="rounded p-0.5 text-muted-foreground transition hover:bg-secondary hover:text-secondary-foreground"
              >
                <Pencil size={12} />
              </button>
            </p>
            {roll.subtitle && <p className="text-xs text-muted-foreground">{roll.subtitle}</p>}
          </div>
        </div>
        <div className="flex flex-row justify-end gap-5">
          <a
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent/80"
            href={`/data/import?originSutraId=${sutraId}&originRollId=${roll.id}${childSutraId ? `&targetSutraId=${childSutraId}` : ''}${roll.children?.id ? `&targetRollId=${roll.children.id}` : ''}`}
          >
            <Upload size={14} />
            Import & Replace
          </a>
          <a
            target="_blank"
            rel="noreferrer"
            href={`/resources/export/${roll.id}`}
            className="flex items-center gap-2 rounded bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
          >
            <Download size={14} />
            Export xlsx
          </a>
        </div>
      </div>

      {isEditing && (
        <div className="px-4 pb-4">
          <RollForm roll={roll} sutraId={sutraId} onClose={onEditClose} childSutraId={childSutraId} />
        </div>
      )}
    </div>
  );
}
