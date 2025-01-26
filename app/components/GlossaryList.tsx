import { useFetcher } from '@remix-run/react';
import { useLocalStorage } from '@uidotdev/usehooks';
import { ChevronRight } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useFieldArray } from 'react-hook-form';
import { ClientOnly } from 'remix-utils/client-only';

import { type ReadGlossary } from '~/drizzle/tables';

import { Icons } from '../components/icons';
import { Badge, Button, Card, CardContent, CardFooter, CardHeader, ScrollArea, Separator } from '../components/ui';
import { Divider } from '../components/ui/divider';
import { glossaryEditFormSchema } from '../validations/glossary.validation';
import { FormInput, FormModal, HiddenInput } from './FormModal';
import { Spacer } from './ui/spacer';

interface GlossaryListProps {
  glossaries: ReadGlossary[];
  // ShowEdit is useful when in the screen that people not allowed to edit glossary
  showEdit?: boolean;
}

export const GlossaryList = React.forwardRef<HTMLDivElement, GlossaryListProps>(
  ({ glossaries, showEdit = true }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState<number>(0);

    const selectedGlossary = useMemo(() => {
      return glossaries[selectedIndex ?? 0];
    }, [glossaries, selectedIndex]);

    if (!glossaries.length) {
      return null;
    }

    if (glossaries.length) {
      return (
        <div className="flex gap-1 lg:gap-4">
          <ScrollArea ref={ref} className="h-[calc(100vh-10rem)] w-1/2 gap-4 pr-4">
            {glossaries.map((glossary, index) => (
              <div
                key={glossary.id}
                onClick={() => setSelectedIndex(index)}
                className={`mb-2 ${selectedIndex === index ? 'rounded-lg bg-gradient-to-r from-yellow-600 to-slate-700 p-0.5' : ''}`}
              >
                <GlossaryItem glossary={glossary} />
              </div>
            ))}
          </ScrollArea>
          <div className="w-1/2">
            <ScrollArea className="h-[calc(100vh-10rem)] gap-4 pr-4">
              <div className="h-full rounded-lg bg-gradient-to-r from-yellow-600 to-slate-700 p-0.5">
                {selectedGlossary ? (
                  <ClientOnly fallback={<div>Loading...</div>}>
                    {() => <GlossaryDetail showEdit={showEdit} glossary={selectedGlossary} />}
                  </ClientOnly>
                ) : (
                  <div>Loading...</div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      );
    }
    return null;
  },
);

GlossaryList.displayName = 'GlossaryList';

interface GlossaryItemProps {
  glossary: ReadGlossary;
}

export function GlossaryItem({ glossary }: GlossaryItemProps) {
  return (
    <Card className="w-full cursor-pointer transition-all duration-300 ease-in-out hover:shadow-md">
      <CardContent className="flex items-center space-x-4 p-4 sm:p-6">
        <div className="min-w-0 flex-1">
          {/* <div className="mb-1 flex items-center">
            <Badge variant="default" className="mr-2 font-mono text-xs font-medium">
              {glossary.sutraName}
            </Badge>
          </div> */}
          <h3 className="mb-2 truncate text-lg font-semibold text-primary sm:text-xl">{glossary.glossary}</h3>
          {glossary.translations?.map((translation, index) => {
            return (
              <p key={index} className="line-clamp-2 text-sm text-muted-foreground">
                {translation.glossary}
              </p>
            );
          })}
        </div>
        <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

export const GlossaryDetail = ({ glossary, showEdit = true }: { glossary: ReadGlossary; showEdit?: boolean }) => {
  const [subscribedGlossaries, setSubscribedGlossaries] = useLocalStorage<string[]>('subscribedGlossaries', []);
  const fetcher = useFetcher<{ success: boolean }>();

  let isBookmarked = useMemo(() => {
    if (glossary?.id) {
      const result = subscribedGlossaries.includes(glossary.id);
      return result;
    }
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glossary, subscribedGlossaries]);

  isBookmarked = fetcher.formData ? fetcher.formData.get('bookmark') === 'true' : isBookmarked;

  useEffect(() => {
    const id = fetcher.formData?.get('glossaryId');

    if (fetcher.formData && id === glossary?.id) {
      const result = fetcher.formData.get('bookmark') === 'true';
      const set = new Set(subscribedGlossaries);
      if (result) {
        set.add(glossary.id);
      } else {
        set.delete(glossary.id);
      }
      const newSubscribedGlossaries = Array.from(set);
      setSubscribedGlossaries(newSubscribedGlossaries);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.formData, subscribedGlossaries, glossary]);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center justify-between pb-0">
        <fetcher.Form method="post" action="/glossary?index&page=-1">
          <input type="hidden" name="glossaryId" value={glossary?.id} />
          <button type="submit" name="bookmark" value={isBookmarked ? 'false' : 'true'}>
            <Icons.BookMark className={`h-6 w-6 ${isBookmarked ? 'fill-red-500 text-red-500' : 'text-slate-800'}`} />
          </button>
        </fetcher.Form>
        {showEdit && (
          <FormModal
            kind="edit"
            title="Update Glossary"
            fetcherKey="edit-glossary"
            schema={glossaryEditFormSchema}
            defaultValues={{
              id: glossary?.id,
              translations: glossary.translations || [],
            }}
            trigger={
              <Button size="icon" variant="ghost">
                <Icons.SquarePen className="h-6 w-6 text-slate-800" />
              </Button>
            }
          >
            <GlossaryEditForm id={glossary.id} />
          </FormModal>
        )}
      </CardHeader>
      <CardContent className="flex-grow">
        <div className="my-2 flex flex-col items-start gap-2 lg:flex-row lg:items-end lg:justify-start">
          <h2 className="text-3xl font-semibold tracking-tight text-primary">{glossary.glossary}</h2>
          {glossary.phonetic && <h2 className="font-mono text-md text-secondary-foreground">({glossary.phonetic})</h2>}
        </div>

        {glossary.translations?.map((translation, index) => {
          return (
            <div key={`${glossary.id}-${index}`}>
              <Divider>{translation.language.toUpperCase()}</Divider>
              <Badge variant="default" className="mb-2 w-fit font-mono text-xs font-medium">
                {translation.sutraName} | {translation.volume}
              </Badge>
              {translation.originSutraText && (
                <div className="flex items-center gap-2">
                  <Icons.Book className="h-4 w-4 flex-shrink-0 text-slate-800" />
                  <h3 className="text-sm font-medium text-muted-foreground">{translation.originSutraText}</h3>
                </div>
              )}
              <Spacer />
              <h2 className="mb-2 text-2xl font-semibold tracking-tight text-primary">{translation.glossary}</h2>
              {translation.targetSutraText && (
                <div className="flex items-center gap-2">
                  <Icons.Book className="h-4 w-4 flex-shrink-0 text-slate-800" />
                  <h3 className="text-sm font-medium text-muted-foreground">{translation.targetSutraText}</h3>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
      <Separator className="px-2" />
      <CardFooter className="flex-col items-center justify-between pt-6 text-sm text-muted-foreground lg:flex-row">
        <div className="flex items-center gap-2 rounded-lg border-2 border-gray-500 px-2 py-1">
          <span className="text-xs font-medium text-muted-foreground">CBETA</span>
          <span className="text-xs font-medium text-muted-foreground">|</span>
          <span className="text-xs font-bold text-muted-foreground">{glossary.cbetaFrequency}</span>
        </div>
        <div className="flex flex-col gap-2 md:flex-row">
          <div className="flex items-center gap-2">
            <Icons.LineChart className="h-4 w-4" />
            <span>{glossary.subscribers}</span>
          </div>
          <div className="flex items-center gap-2">
            <Icons.User className="h-4 w-4" />
            <span>{glossary.author || glossary.updatedBy}</span>
          </div>
          <div className="flex items-center gap-2">
            <Icons.Clock className="h-4 w-4" />
            <span>{glossary.updatedAt.toLocaleDateString()}</span>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
};

const GlossaryEditForm = ({ id }: { id: string }) => {
  const { fields } = useFieldArray({
    name: 'translations',
  });

  return (
    <div className="flex max-h-[66vh] flex-col gap-4 overflow-y-auto px-4">
      <HiddenInput name="id" value={id} />
      {fields.map((field, index) => (
        <div key={field.id}>
          {/* @ts-ignore */}
          <Divider>{field.language.toUpperCase()}</Divider>
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              required
              label="Glossary"
              name={`translations.${index}.glossary`}
              description="The glossary of the translation."
            />
            <FormInput
              required
              label="Sutra Name"
              name={`translations.${index}.sutraName`}
              description="The sutra name of the translation."
            />
            <FormInput
              required
              label="Volume"
              name={`translations.${index}.volume`}
              description="The volume of the translation."
            />
            <FormInput
              label="Origin Sutra Text"
              name={`translations.${index}.originSutraText`}
              description="The origin sutra text of the translation."
            />
            <FormInput
              label="Target Sutra Text"
              name={`translations.${index}.targetSutraText`}
              description="The target sutra text of the translation."
            />
            <FormInput
              label="Phonetic"
              name={`translations.${index}.phonetic`}
              description="The phonetic of the translation."
            />
          </div>
        </div>
      ))}
    </div>
  );
};
