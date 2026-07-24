import { useFetcher } from '@remix-run/react';
import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useToast } from '~/hooks/use-toast';

import { DeleteConfirmDialog } from './DeleteConfirmDialog';

type DeleteResult = { success: boolean; message?: string; error?: string };

// Trash button + confirmation dialog for deleting an entity via a fetcher (so
// the surrounding page does not navigate). The server decides whether the row
// is actually deletable (nothing references it) and returns the reason when it
// is not; that reason is surfaced as a toast. Callers that already know a row is
// undeletable (e.g. a work with documents) can disable the button up front.
export function DeleteEntityButton({
  entity,
  intent,
  idName,
  id,
  label,
  size = 13,
  disabled = false,
  disabledReason,
}: {
  entity: string;
  intent: string;
  idName: string;
  id: string;
  label: string;
  size?: number;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const fetcher = useFetcher<DeleteResult>();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const isSubmitting = fetcher.state !== 'idle';

  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data) return;
    toast({
      variant: fetcher.data.success ? 'default' : 'error',
      title: fetcher.data.success ? 'Done' : 'Oops!',
      description: fetcher.data.success ? fetcher.data.message : fetcher.data.error,
      position: 'top-right',
    });
    if (fetcher.data.success) setOpen(false);
  }, [fetcher.state, fetcher.data, toast]);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        title={disabled ? disabledReason : `Delete ${entity}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="text-muted-foreground hover:bg-secondary hover:text-destructive rounded p-1 transition disabled:pointer-events-none disabled:opacity-40"
      >
        <Trash2 size={size} />
      </button>

      <DeleteConfirmDialog
        open={open}
        intent={intent}
        onOpenChange={setOpen}
        fields={{ [idName]: id }}
        submitting={isSubmitting}
        title={`Delete ${entity}?`}
        FormComponent={fetcher.Form}
        description={`This permanently deletes “${label}”. It cannot be undone, and only works if nothing else references it.`}
      />
    </>
  );
}
