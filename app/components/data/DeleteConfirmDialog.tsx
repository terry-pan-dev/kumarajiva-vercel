import { Form as RemixForm } from '@remix-run/react';
import { type ElementType, type ReactNode } from 'react';

import { Icons } from '~/components/icons';
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

// The shared confirm-and-delete chrome: dialog, header, an optional detail body
// (`children`), a Cancel action, and a destructive submit that posts `intent`
// plus `fields` as hidden inputs. Callers own *how* the delete is triggered and
// what happens on success:
//   - Per-row deletes pass `fetcher.Form` and handle the result via the fetcher
//     (see DeleteEntityButton).
//   - Page-level deletes use the default navigation `Form` and react to
//     `actionData` in the route.
// Both the navigation `Form` and a fetcher's `Form` satisfy `ElementType`.
type DeleteForm = ElementType;

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  intent,
  fields,
  submitting,
  FormComponent = RemixForm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  intent: string;
  fields?: Record<string, string>;
  submitting: boolean;
  FormComponent?: DeleteForm;
  children?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={submitting}>
              Cancel
            </Button>
          </DialogClose>
          <FormComponent method="post">
            <input type="hidden" name="intent" value={intent} />
            {fields &&
              Object.entries(fields).map(([name, value]) => (
                <input key={name} name={name} type="hidden" value={value} />
              ))}
            <Button type="submit" variant="destructive" disabled={submitting}>
              {submitting ? <Icons.Loader className="h-4 w-4 animate-spin" /> : 'Delete'}
            </Button>
          </FormComponent>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
