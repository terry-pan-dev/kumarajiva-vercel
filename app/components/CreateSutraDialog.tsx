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

interface SutraRelationship {
  origin: ReadSutra;
  target?: ReadSutra;
}

function truncateId(id: string): string {
  if (id.length <= 8) return id;
  return `${id.slice(0, 4)}...${id.slice(-4)}`;
}

function getSutraRelationships(sutras: ReadSutra[]): SutraRelationship[] {
  // Create a map of parent ID to target sutras for quick lookup
  const targetsByParentId = new Map<string, ReadSutra[]>();
  const targets = sutras.filter((sutra) => sutra.parentId);

  targets.forEach((target) => {
    if (target.parentId) {
      if (!targetsByParentId.has(target.parentId)) {
        targetsByParentId.set(target.parentId, []);
      }
      targetsByParentId.get(target.parentId)!.push(target);
    }
  });

  const relationships: SutraRelationship[] = [];

  // For each sutra that has children, show the parent-child relationships
  sutras.forEach((sutra) => {
    const relatedTargets = targetsByParentId.get(sutra.id) || [];

    if (relatedTargets.length === 0) {
      // Only show sutras without children if they also don't have parents (root sutras)
      if (!sutra.parentId) {
        relationships.push({ origin: sutra });
      }
    } else {
      // Sutra with one or more children
      relatedTargets.forEach((target) => {
        relationships.push({ origin: sutra, target });
      });
    }
  });

  return relationships;
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
          {/* Sutra Parent-Child Relationship Table */}
          <div>
            <h3 className="mb-3 text-md font-semibold">Existing Sutras (Parent-Child Relationships)</h3>
            <div style={{ height: '26vh' }} className="rounded-lg border">
              <ScrollArea className="h-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[150px]">Origin ID</TableHead>
                      <TableHead className="w-[200px]">Origin Sutra Title</TableHead>
                      <TableHead className="w-[100px]">Copy ID</TableHead>
                      <TableHead className="w-[150px] bg-blue-50">Target ID</TableHead>
                      <TableHead className="w-[200px] bg-blue-50">Target Sutra Title</TableHead>
                      <TableHead className="w-[100px] bg-blue-50">Copy ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getSutraRelationships(sutras).map((relationship, index) => (
                      <TableRow key={`${relationship.origin.id}-${relationship.target?.id || 'no-target'}-${index}`}>
                        <TableCell className="font-mono text-sm" title={relationship.origin.id}>
                          {truncateId(relationship.origin.id)}
                        </TableCell>
                        <TableCell className="truncate" title={relationship.origin.title}>
                          {relationship.origin.title}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            type="button"
                            variant="ghost"
                            onClick={() => handleCopy(relationship.origin.id)}
                            className={`h-8 w-8 p-0 transition-all duration-200 ${
                              copiedId === relationship.origin.id
                                ? 'scale-110 bg-green-100 text-green-600'
                                : 'hover:bg-gray-100'
                            }`}
                          >
                            {copiedId === relationship.origin.id ? (
                              <Icons.Check className="h-4 w-4" />
                            ) : (
                              <Icons.Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell title={relationship.target?.id || ''} className="bg-blue-50 font-mono text-sm">
                          {relationship.target ? truncateId(relationship.target.id) : '-'}
                        </TableCell>
                        <TableCell className="truncate bg-blue-50" title={relationship.target?.title || ''}>
                          {relationship.target ? relationship.target.title : '-'}
                        </TableCell>
                        <TableCell className="bg-blue-50">
                          {relationship.target ? (
                            <Button
                              size="sm"
                              type="button"
                              variant="ghost"
                              onClick={() => handleCopy(relationship.target!.id)}
                              className={`h-8 w-8 p-0 transition-all duration-200 ${
                                copiedId === relationship.target.id
                                  ? 'scale-110 bg-green-100 text-green-600'
                                  : 'hover:bg-blue-100'
                              }`}
                            >
                              {copiedId === relationship.target.id ? (
                                <Icons.Check className="h-4 w-4" />
                              ) : (
                                <Icons.Copy className="h-4 w-4" />
                              )}
                            </Button>
                          ) : (
                            '-'
                          )}
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
            <CreateSutraForm sutras={sutras} />
          </div>
        </div>
      </ScrollArea>
    </FormModal>
  );
}

function CreateSutraForm({ sutras }: { sutras: ReadSutra[] }) {
  // All sutras can potentially be parents (origins) for other sutras
  const originSutraOptions = sutras.map((sutra) => ({
    label: sutra.title,
    value: sutra.id,
  }));

  return (
    <div className="space-y-4 px-2">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
        <FormSelect
          name="parentId"
          label="Origin Sutra"
          options={originSutraOptions}
          description="Select the parent sutra if this is a translation or variation"
        />
      </div>
    </div>
  );
}
