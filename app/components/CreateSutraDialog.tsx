import { useState } from 'react';

import type { ReadSutra } from '~/drizzle/tables';

import { createSutraSchema } from '~/validations/sutra.validation';

import { FormInput, FormSelect, FormModal } from './FormModal';
import { Icons } from './icons';
import { Button, ScrollArea, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui';

interface CreateSutraDialogProps {
  sutras: ReadSutra[];
  trigger?: React.ReactNode;
}

export function CreateSutraDialog({ sutras, trigger }: CreateSutraDialogProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      // Reset after animation
      setTimeout(() => setCopiedId(null), 1000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <FormModal
      kind="create-sutra"
      title="Create Sutra"
      schema={createSutraSchema}
      trigger={
        trigger || (
          <Button variant="outline" className="flex h-8 items-center gap-2">
            <Icons.Add className="h-4 w-4" />
            Create Sutra
          </Button>
        )
      }
    >
      <ScrollArea className="max-h-[70vh]">
        <div className="flex flex-col gap-6">
          {/* Sutra List - Takes up 50% of dialog height */}
          <div>
            <h3 className="mb-3 text-md font-semibold">Existing Sutras</h3>
            <div style={{ height: '24vh' }} className="rounded-lg border">
              <ScrollArea className="h-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">ID</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Language</TableHead>
                      <TableHead className="w-[60px]">Copy</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sutras.map((sutra) => (
                      <TableRow key={sutra.id}>
                        <TableCell className="font-mono text-sm">{sutra.id}</TableCell>
                        <TableCell>{sutra.title}</TableCell>
                        <TableCell>{sutra.language}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            type="button"
                            variant="ghost"
                            onClick={() => handleCopy(sutra.id)}
                            className={`h-8 w-8 p-0 transition-all duration-200 ${
                              copiedId === sutra.id ? 'scale-110 bg-green-100 text-green-600' : 'hover:bg-gray-100'
                            }`}
                          >
                            {copiedId === sutra.id ? (
                              <Icons.Check className="h-4 w-4" />
                            ) : (
                              <Icons.Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          </div>
          {/* Create Form - Takes up remaining space */}
          <div>
            <h3 className="mb-3 text-md font-semibold">Create New Sutra</h3>
            <CreateSutraForm />
          </div>
        </div>
      </ScrollArea>
    </FormModal>
  );
}

function CreateSutraForm() {
  return (
    <div className="space-y-4 px-2">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormInput required name="title" label="Title" description="The sutra name" />
        <FormInput name="subtitle" label="Subtitle" />
        <FormInput required name="category" label="Category" description="fx. 般若部" />
        <FormInput required name="translator" label="Translator" description="The original translator name" />
        <FormInput required name="cbeta" label="CBETA" description="The cbeta sutra number, fx. T0235" />
        <FormSelect
          required
          name="language"
          label="Language"
          description="The original sutra language"
          options={[
            { label: 'Chinese', value: 'chinese' },
            { label: 'English', value: 'english' },
            { label: 'Sanskrit', value: 'sanskrit' },
            { label: 'Indonesian', value: 'indonesian' },
          ]}
        />
      </div>
    </div>
  );
}
