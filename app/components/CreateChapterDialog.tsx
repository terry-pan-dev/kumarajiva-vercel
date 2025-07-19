import { useState, useEffect, useCallback } from 'react';
import { useFormContext } from 'react-hook-form';

import type { ReadRollWithSutra, ReadSutra, ReadRoll } from '~/drizzle/tables';

import { createRollSchema } from '~/validations/roll.validation';

import { FormInput, FormSelect, FormModal } from './FormModal';
import { Icons } from './icons';
import { Button, ScrollArea, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui';

type SutraWithRolls = ReadSutra & {
  rolls?: (
    | ReadRoll
    | {
        id: string;
        title: string;
        subtitle: string;
        parentId: string | null;
        sutraId: string;
        createdAt: string;
        updatedAt: string;
        deletedAt: string | null;
        createdBy: string;
        updatedBy: string;
      }
  )[];
  children?: ReadSutra[];
  parent?: ReadSutra | null;
};

interface CreateChapterDialogProps {
  sutras: SutraWithRolls[];
  trigger?: React.ReactNode;
}

export function CreateChapterDialog({ sutras, trigger }: CreateChapterDialogProps) {
  const [selectedSutraId, setSelectedSutraId] = useState<string | null>(null);
  const [chapters, setChapters] = useState<ReadRollWithSutra[]>([]);
  const [isLoadingChapters, setIsLoadingChapters] = useState(false);
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

  const fetchChaptersBySutra = useCallback(
    async (sutraId: string) => {
      if (!sutraId || selectedSutraId === sutraId) return;

      setSelectedSutraId(sutraId);
      setIsLoadingChapters(true);
      try {
        const response = await fetch(`/api/chapters?sutraId=${sutraId}`);
        if (response.ok) {
          const data = await response.json();
          setChapters(data);
        }
      } catch (error) {
        console.error('Failed to fetch chapters:', error);
      } finally {
        setIsLoadingChapters(false);
      }
    },
    [selectedSutraId],
  );

  return (
    <FormModal
      kind="create-roll"
      title="Create Chapter"
      schema={createRollSchema}
      trigger={
        trigger || (
          <Button variant="outline" className="flex h-8 items-center gap-2">
            <Icons.Add className="h-4 w-4" />
            Create Chapter
          </Button>
        )
      }
    >
      <ScrollArea className="max-h-[70vh]">
        <div className="flex flex-col gap-6">
          {/* Create Form - Show first */}
          <div>
            <h3 className="mb-3 text-md font-semibold">Create New Chapter</h3>
            <CreateChapterFormWrapper sutras={sutras} onSutraSelect={fetchChaptersBySutra} />
          </div>

          {/* Chapter List - Show only when sutra is selected */}
          {selectedSutraId && (
            <div>
              <h3 className="mb-3 text-md font-semibold">Existing Chapters in Selected Sutra</h3>
              <div style={{ height: '24vh' }} className="rounded-lg border">
                <ScrollArea className="h-full">
                  {isLoadingChapters ? (
                    <div className="flex h-full items-center justify-center">
                      <Icons.Loader className="h-6 w-6 animate-spin" />
                      <span className="ml-2">Loading chapters...</span>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[200px]">ID</TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead>Subtitle</TableHead>
                          <TableHead className="w-[60px]">Copy</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {chapters.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground">
                              No chapters found for this sutra
                            </TableCell>
                          </TableRow>
                        ) : (
                          chapters.map((chapter) => (
                            <TableRow key={chapter.id}>
                              <TableCell className="font-mono text-sm">{chapter.id}</TableCell>
                              <TableCell>{chapter.title}</TableCell>
                              <TableCell>{chapter.subtitle}</TableCell>
                              <TableCell>
                                <Button
                                  size="sm"
                                  type="button"
                                  variant="ghost"
                                  onClick={() => handleCopy(chapter.id)}
                                  className={`h-8 w-8 p-0 transition-all duration-200 ${
                                    copiedId === chapter.id
                                      ? 'scale-110 bg-green-100 text-green-600'
                                      : 'hover:bg-gray-100'
                                  }`}
                                >
                                  {copiedId === chapter.id ? (
                                    <Icons.Check className="h-4 w-4" />
                                  ) : (
                                    <Icons.Copy className="h-4 w-4" />
                                  )}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  )}
                </ScrollArea>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </FormModal>
  );
}

function CreateChapterFormWrapper({
  sutras,
  onSutraSelect,
}: {
  sutras: SutraWithRolls[];
  onSutraSelect: (sutraId: string) => void;
}) {
  return <CreateChapterForm sutras={sutras} onSutraSelect={onSutraSelect} />;
}

function CreateChapterForm({
  sutras,
  onSutraSelect,
}: {
  sutras: SutraWithRolls[];
  onSutraSelect: (sutraId: string) => void;
}) {
  const { watch } = useFormContext();
  const sutraId = watch('sutraId');

  useEffect(() => {
    if (sutraId) {
      onSutraSelect(sutraId);
    }
  }, [sutraId, onSutraSelect]);

  // Get the selected sutra to find its parent
  const selectedSutra = sutras.find((sutra) => sutra.id === sutraId);

  // Get parent sutra and its chapters for the Origin Chapter ID dropdown
  const parentSutra = selectedSutra?.parent;
  // Find the parent sutra in the full sutras list to get its rolls
  const parentSutraWithRolls = parentSutra ? sutras.find((s) => s.id === parentSutra.id) : null;
  const parentChapters = parentSutraWithRolls?.rolls || [];

  // Show Origin Chapter ID dropdown only if parent sutra has chapters
  const showOriginChapterDropdown = parentSutra && parentChapters.length > 0;

  return (
    <div className="space-y-4 px-2">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormSelect
          required
          label="Sutra"
          name="sutraId"
          description="Select the sutra this chapter belongs to"
          options={sutras.map((sutra) => ({
            label: sutra.title,
            value: sutra.id,
          }))}
        />
        <FormInput required name="title" label="Title" description="The chapter title" />
        <FormInput required name="subtitle" label="Subtitle" description="The chapter subtitle" />
        {showOriginChapterDropdown ? (
          <FormSelect
            name="parentId"
            label="Origin Chapter ID"
            placeholder="Select a chapter or leave blank"
            description="Select the corresponding chapter from the origin sutra"
            options={parentChapters.map((chapter) => ({
              label: `${chapter.title} (${chapter.subtitle})`,
              value: chapter.id,
            }))}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">Origin Chapter ID</label>
            <div className="rounded-md border border-gray-300 bg-gray-50 p-2 text-sm text-gray-500">
              {parentSutra ? 'No chapters found in origin sutra' : 'No origin sutra associated'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
