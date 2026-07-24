import { useFetcher } from '@remix-run/react';
import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui';
import { useToast } from '~/hooks/use-toast';

type DeleteResult = { success: boolean; message?: string; error?: string };

// Trash button + confirmation dialog for deleting a work or document from the
// Works & Documents page. The server decides whether the row is actually
// deletable (no references) and returns the reason when it is not; that reason
// is surfaced as a toast. Works can be disabled up front because their document
// count is already known client-side.
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
  entity: 'work' | 'document';
  intent: 'delete-work' | 'delete-document';
  idName: 'workId' | 'documentId';
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Delete {entity}?</DialogTitle>
            <DialogDescription>
              This permanently deletes “{label}”. It cannot be undone, and only works if nothing else references it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value={intent} />
              <input value={id} type="hidden" name={idName} />
              <Button type="submit" variant="destructive" disabled={isSubmitting}>
                {isSubmitting ? 'Deleting…' : 'Delete'}
              </Button>
            </fetcher.Form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
