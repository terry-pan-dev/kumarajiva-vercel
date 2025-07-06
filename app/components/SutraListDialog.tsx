import { useState } from 'react';

import type { ReadSutra } from '~/drizzle/tables';

import { Icons } from '~/components/icons';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui';

interface SutraListDialogProps {
  sutras: ReadSutra[];
  trigger?: React.ReactNode;
}

export function SutraListDialog({ sutras, trigger }: SutraListDialogProps) {
  const [open, setOpen] = useState(false);

  const handleCopy = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="flex h-8 items-center gap-2">
            <Icons.Add className="h-4 w-4" />
            Create Sutra
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Existing Sutras</DialogTitle>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sutras.map((sutra) => (
                <TableRow key={sutra.id}>
                  <TableCell className="font-mono text-sm">{sutra.id}</TableCell>
                  <TableCell>{sutra.title}</TableCell>
                  <TableCell>{sutra.category}</TableCell>
                  <TableCell>{sutra.language}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleCopy(sutra.id)}>
                      <Icons.Copy className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
