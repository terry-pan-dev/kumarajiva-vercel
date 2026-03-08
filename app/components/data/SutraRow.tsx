import { ChevronRight, Pencil, Plus } from 'lucide-react';

import type { SutraForForm } from './types';

import { RollForm } from './RollForm';
import { RollRow } from './RollRow';
import { SutraForm } from './SutraForm';

type Roll = {
  id: string;
  title: string;
  subtitle: string;
  children?: { id: string; title: string; subtitle: string } | null;
};

type Sutra = SutraForForm & {
  rolls?: Roll[] | null;
};

type Props = {
  sutra: Sutra;
  isEditingSutra: boolean;
  isAddingRoll: boolean;
  editingRollId: string | null;
  onEditSutraToggle: () => void;
  onEditSutraClose: () => void;
  onAddRollToggle: () => void;
  onAddRollClose: () => void;
  onEditRollToggle: (rollId: string) => void;
  onEditRollClose: () => void;
};

export function SutraRow({
  sutra,
  isEditingSutra,
  isAddingRoll,
  editingRollId,
  onEditSutraToggle,
  onEditSutraClose,
  onAddRollToggle,
  onAddRollClose,
  onEditRollToggle,
  onEditRollClose,
}: Props) {
  const childSutraId = sutra.children?.id ?? null;

  const sutraForForm: SutraForForm = {
    id: sutra.id,
    title: sutra.title,
    subtitle: sutra.subtitle,
    language: sutra.language,
    category: sutra.category,
    translator: sutra.translator,
    cbeta: sutra.cbeta,
    children: sutra.children
      ? {
          id: sutra.children.id,
          title: sutra.children.title,
          subtitle: sutra.children.subtitle,
          language: sutra.children.language,
        }
      : null,
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background shadow-sm">
      <details className="group">
        <summary className="flex cursor-pointer items-center justify-between bg-muted p-4 transition hover:bg-muted/80">
          {/* Left: chevron + title + edit pencil */}
          <div className="flex items-center gap-3">
            <div className="text-muted-foreground transition-transform group-open:rotate-90">
              <ChevronRight size={20} />
            </div>
            <div>
              <h3 className="flex items-center gap-1.5 text-lg font-semibold text-foreground">
                {sutra.title} {sutra.children?.title}
                <button
                  type="button"
                  title="Edit sutra"
                  className="rounded p-1 text-muted-foreground transition hover:bg-secondary hover:text-secondary-foreground"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onEditSutraToggle();
                  }}
                >
                  <Pencil size={13} />
                </button>
              </h3>
              <div className="text-xs text-muted-foreground">
                {sutra.rolls?.length || 0} Rolls • {sutra.category}
              </div>
            </div>
          </div>

          {/* Right: Add Roll button — only visible when expanded */}
          <button
            type="button"
            title="Add roll"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAddRollToggle();
            }}
            className="hidden items-center gap-1.5 rounded bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/80 group-open:flex"
          >
            <Plus size={13} />
            Add Roll
          </button>
        </summary>

        {/* Edit-sutra form */}
        {isEditingSutra && (
          <div className="p-4 pt-0">
            <SutraForm sutra={sutraForForm} onClose={onEditSutraClose} />
          </div>
        )}

        {/* Rolls list */}
        <div className="divide-y divide-border border-t border-border">
          {sutra.rolls && sutra.rolls.length > 0 ? (
            sutra.rolls.map((roll) => (
              <RollRow
                roll={roll}
                key={roll.id}
                sutraId={sutra.id}
                childSutraId={childSutraId}
                onEditClose={onEditRollClose}
                isEditing={editingRollId === roll.id}
                onEditToggle={() => onEditRollToggle(roll.id)}
              />
            ))
          ) : (
            <div className="p-4 text-center text-sm text-muted-foreground">No rolls found for this sutra.</div>
          )}
        </div>
      </details>

      {/* Add-roll form */}
      {isAddingRoll && (
        <div className="border-t border-border p-4">
          <RollForm sutraId={sutra.id} onClose={onAddRollClose} childSutraId={childSutraId} />
        </div>
      )}
    </div>
  );
}
