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
      <div className="hover:bg-muted/50 flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <FileText size={18} className="text-muted-foreground" />
          <div>
            <p className="text-foreground flex items-center gap-1.5 font-medium">
              {roll.title} {roll.children?.title}
              <button
                type="button"
                title="Edit roll"
                onClick={onEditToggle}
                className="text-muted-foreground hover:bg-secondary hover:text-secondary-foreground rounded p-0.5 transition"
              >
                <Pencil size={12} />
              </button>
            </p>
            {roll.subtitle && <p className="text-muted-foreground text-xs">{roll.subtitle}</p>}
          </div>
        </div>
        <div className="flex flex-row justify-end gap-5">
          <a
            target="_blank"
            rel="noreferrer"
            className="bg-accent text-accent-foreground hover:bg-accent/80 flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium"
            href={`/data/translation/import?originSutraId=${sutraId}&originRollId=${roll.id}${childSutraId ? `&targetSutraId=${childSutraId}` : ''}${roll.children?.id ? `&targetRollId=${roll.children.id}` : ''}`}
          >
            <Upload size={14} />
            Import & Replace
          </a>
          <a
            target="_blank"
            rel="noreferrer"
            href={`/resources/export/${roll.id}`}
            className="bg-secondary text-secondary-foreground hover:bg-secondary/80 flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium"
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
