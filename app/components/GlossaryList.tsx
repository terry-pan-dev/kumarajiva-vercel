import { useFetcher } from '@remix-run/react';
import { useLocalStorage } from '@uidotdev/usehooks';
import { ChevronRight } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useFieldArray } from 'react-hook-form';
import { ClientOnly } from 'remix-utils/client-only';

import { langEnum, type ReadGlossary } from '~/drizzle/tables';

import { Can } from '../authorisation';
import { Icons } from '../components/icons';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  ScrollArea,
  Separator,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '../components/ui';
import { Divider } from '../components/ui/divider';
import { glossaryEditFormSchema, glossaryInsertFormSchema } from '../validations/glossary.validation';
import { FormInput, FormModal, FormSelect, FormTextarea, HiddenInput } from './FormModal';
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
        <div className="flex flex-col gap-4 pb-0 lg:flex-row lg:gap-4">
          <div className="order-1 h-[calc(50vh-6rem)] w-full lg:order-2 lg:h-[calc(100vh-11rem)] lg:w-1/2">
            <ScrollArea className="h-full lg:pr-4">
              <div className="h-full rounded-lg bg-gradient-to-r from-yellow-600 to-slate-700 p-0.5">
                {selectedGlossary ? (
                  <ClientOnly fallback={<div>Loading...</div>}>
                    {() => <GlossaryDetail showEdit={showEdit} glossary={selectedGlossary} />}
                  </ClientOnly>
                ) : (
                  <div>No glossary selected</div>
                )}
              </div>
            </ScrollArea>
          </div>
          <div className="order-2 h-[calc(50vh-6rem)] w-full lg:order-1 lg:h-[calc(100vh-11rem)] lg:w-1/2">
            <ScrollArea ref={ref} className="h-full lg:pr-4">
              <ul>
                {glossaries.length > 0 ? (
                  glossaries.map((glossary, index) => (
                    <li
                      key={glossary.id}
                      onClick={() => setSelectedIndex(index)}
                      className={`mb-2 ${selectedIndex === index ? 'rounded-lg bg-gradient-to-r from-yellow-600 to-slate-700 p-0.5' : ''}`}
                    >
                      <GlossaryItem glossary={glossary} />
                    </li>
                  ))
                ) : (
                  <div>No glossaries found</div>
                )}
              </ul>
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

export const GlossaryDetail = ({ glossary, showEdit = false }: { glossary: ReadGlossary; showEdit?: boolean }) => {
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

  // Regex cache to avoid recompilation
  const regexCache = useRef<Map<string, RegExp>>(new Map());

  const highlightKeyword = useCallback(({ text, keyword }: { text?: string | null; keyword: string }) => {
    if (!text || !keyword.trim()) {
      return text ? <>{text}</> : null;
    }

    const trimmedKeyword = keyword.trim();

    // Get or create cached regex
    let regex = regexCache.current.get(trimmedKeyword);
    if (!regex) {
      // Escape special regex characters
      const escapedKeyword = trimmedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      regex = new RegExp(escapedKeyword, 'gi');

      // Limit cache size to prevent memory leaks
      if (regexCache.current.size > 50) {
        regexCache.current.clear();
      }
      regexCache.current.set(trimmedKeyword, regex);
    }

    // Use single-pass algorithm to find matches and build result
    const result: React.ReactNode[] = [];
    let lastIndex = 0;
    let matchCount = 0;
    const MAX_HIGHLIGHTS = 15; // Increased limit since we're more efficient now

    // Reset regex lastIndex for global search
    regex.lastIndex = 0;

    let match;
    while ((match = regex.exec(text)) !== null && matchCount < MAX_HIGHLIGHTS) {
      // Add text before the match
      if (match.index > lastIndex) {
        const beforeText = text.slice(lastIndex, match.index);
        if (beforeText) {
          result.push(beforeText);
        }
      }

      // Add highlighted match
      result.push(
        <mark key={`highlight-${matchCount}`} className="bg-transparent font-semibold text-yellow-600">
          {match[0]}
        </mark>,
      );

      lastIndex = match.index + match[0].length;
      matchCount++;

      // Prevent infinite loop with zero-length matches
      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }

    // Add remaining text after last match
    if (lastIndex < text.length) {
      const remainingText = text.slice(lastIndex);
      if (remainingText) {
        result.push(remainingText);
      }
    }

    // If no matches found, return original text
    if (matchCount === 0) {
      return <>{text}</>;
    }

    return <>{result}</>;
  }, []);

  return (
    <TooltipProvider>
      <Card className="flex h-full flex-col">
        <CardHeader className="flex-row items-center justify-between px-2 py-4">
          <fetcher.Form method="post" action="/glossary?index&page=-1">
            <input type="hidden" name="glossaryId" value={glossary?.id} />
            <button
              type="submit"
              name="bookmark"
              aria-label="bookmark-glossary"
              value={isBookmarked ? 'false' : 'true'}
            >
              <Icons.BookMark
                className={`ml-1 h-6 w-6 ${isBookmarked ? 'fill-red-500 text-red-500' : 'text-slate-800'}`}
              />
            </button>
          </fetcher.Form>
          {showEdit && (
            <div className="flex">
              <Can I="Update" this="Glossary">
                <FormModal
                  kind="edit"
                  title="Update Glossary"
                  fetcherKey="edit-glossary"
                  schema={glossaryEditFormSchema}
                  trigger={
                    <Button size="icon" variant="ghost" aria-label="edit-glossary">
                      <Icons.SquarePen className="h-6 w-6 text-slate-800" />
                    </Button>
                  }
                  defaultValues={{
                    id: glossary?.id,
                    glossary: glossary.glossary,
                    author: glossary.author || '',
                    cbetaFrequency: glossary.cbetaFrequency || '',
                    phonetic: glossary.phonetic || '',
                    translations: glossary.translations || [],
                    discussion: glossary.discussion || '',
                  }}
                >
                  <GlossaryEditForm id={glossary.id} />
                </FormModal>
              </Can>
              <Can I="Create" this="Glossary">
                <FormModal
                  kind="insert"
                  title="Add New Glossary"
                  fetcherKey="insert-glossary"
                  schema={glossaryInsertFormSchema}
                  trigger={
                    <Button size="icon" variant="ghost" aria-label="add-glossary">
                      <Icons.SquarePlus className="h-6 w-6 text-slate-800" />
                    </Button>
                  }
                >
                  <GlossaryInsertForm id={glossary.id} />
                </FormModal>
              </Can>
            </div>
          )}
        </CardHeader>
        <CardContent className="flex-grow px-4">
          <div className="my-2 flex items-end justify-start gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-primary lg:text-3xl">{glossary.glossary}</h2>
            {glossary.phonetic && (
              <h2 className="font-mono text-md text-secondary-foreground">({glossary.phonetic})</h2>
            )}
            <div className="ml-auto" />
            {glossary.discussion && (
              <Tooltip>
                <span className="inline-block align-middle">
                  <TooltipTrigger aria-label="discussion">
                    <Icons.Discussion className="h-6 w-6 text-primary" />
                  </TooltipTrigger>
                </span>
                <TooltipContent side="right" role="tooltip" aria-label="discussion tooltip">
                  <p>{glossary.discussion}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {glossary.translations?.map((translation, index) => {
            const originSutraText = highlightKeyword({ text: translation.originSutraText, keyword: glossary.glossary });
            const targetSutraText = highlightKeyword({
              text: translation.targetSutraText,
              keyword: translation.glossary,
            });
            return (
              <div key={`${glossary.id}-${index}`}>
                <Divider className="py-1 text-primary lg:py-3">{translation.language.toUpperCase()}</Divider>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="default" className="w-fit font-mono text-xs font-medium">
                    {translation.sutraName} | {translation.volume}
                  </Badge>
                  {translation.updatedAt && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Icons.Clock className="h-3 w-3" />
                      {new Date(translation.updatedAt).toLocaleDateString()}
                    </span>
                  )}
                  {translation.author && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Icons.User className="h-3 w-3" />
                      {translation.author}
                    </span>
                  )}
                </div>
                {originSutraText && (
                  <div className="flex items-center gap-2">
                    <Icons.Book className="h-4 w-4 flex-shrink-0 text-slate-800" />
                    <h3 className="text-sm font-medium text-muted-foreground">{originSutraText}</h3>
                  </div>
                )}
                <Spacer />
                <h2 className="mb-2 text-xl font-semibold tracking-tight text-primary lg:text-2xl">
                  {translation.glossary}
                </h2>
                {targetSutraText && (
                  <div className="flex items-center gap-2">
                    <Icons.Book className="h-4 w-4 flex-shrink-0 text-slate-800" />
                    <h3 className="text-sm font-medium text-muted-foreground">{targetSutraText}</h3>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
        <Separator className="px-2" />
        <CardFooter className="flex items-center justify-between p-2 text-sm text-muted-foreground lg:flex-row lg:justify-around lg:p-6 lg:pt-6">
          <div className="flex items-center gap-2 rounded-lg border-2 border-gray-500 px-2 py-1">
            <span className="text-xs font-medium text-muted-foreground">CBETA</span>
            <span className="text-xs font-medium text-muted-foreground">|</span>
            <span title="cbeta-frequency" className="text-xs font-bold text-muted-foreground">
              {glossary.cbetaFrequency}
            </span>
          </div>
          {/* <div className="flex flex-col gap-2 md:flex-row"> */}
          <div className="flex items-center gap-2">
            <Icons.LineChart className="h-4 w-4" />
            <span title="subscribers">{glossary.subscribers}</span>
          </div>
          <div className="flex items-center gap-2">
            <Icons.User className="h-4 w-4" />
            <span title="author">{glossary.author || glossary.updatedBy}</span>
          </div>
          <div className="flex items-center gap-2">
            <Icons.Clock className="h-4 w-4" />
            <span title="updated-at">{glossary.updatedAt.toLocaleDateString()}</span>
          </div>
          {/* </div> */}
        </CardFooter>
      </Card>
    </TooltipProvider>
  );
};

const GlossaryEditForm = ({ id }: { id: string }) => {
  const { fields } = useFieldArray({
    name: 'translations',
  });
  return (
    <div className="flex max-h-[66vh] flex-col gap-4 overflow-y-auto px-4">
      <HiddenInput name="id" value={id} />
      <Divider>CHINESE</Divider>
      <div className="grid grid-cols-2 gap-4">
        <FormInput required disabled={true} label="Glossary" name={`glossary`} description="The glossary of Chinese." />
        <FormInput required label="Phonetic" name={`phonetic`} description="The phonetic of the glossary." />
        <FormInput label="Author" name={`author`} description="The author of the glossary." />
        <FormInput label="CBETA Frequency" name={`cbetaFrequency`} description="The cbeta frequency of the glossary." />
        <span className="col-span-2">
          <FormTextarea label="Discussion" name={`discussion`} description="The discussion of the glossary." />
        </span>
      </div>
      {fields.map((field, index) => (
        <div key={field.id}>
          {/* @ts-ignore */}
          <Divider>{field.language.toUpperCase()}</Divider>
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              required
              label="Glossary"
              name={`translations.${index}.glossary`}
              description="The glossary of the glossary."
            />
            <FormInput
              required
              label="Sutra Name"
              name={`translations.${index}.sutraName`}
              description="The sutra name of the glossary."
            />
            <FormInput
              required
              label="Volume"
              name={`translations.${index}.volume`}
              description="The volume of the glossary."
            />
            <FormInput
              label="Phonetic"
              name={`translations.${index}.phonetic`}
              description="The phonetic of the glossary."
            />
            <FormTextarea
              label="Origin Sutra Text"
              name={`translations.${index}.originSutraText`}
              description="The origin sutra text of the glossary."
            />
            <FormTextarea
              label="Target Sutra Text"
              name={`translations.${index}.targetSutraText`}
              description="The target sutra text of the glossary."
            />
            <FormInput
              label="Part of Speech"
              name={`translations.${index}.partOfSpeech`}
              description="The part of speech of the glossary."
            />
            <FormInput label="Author" name={`translations.${index}.author`} description="The author of the glossary." />
          </div>
        </div>
      ))}
    </div>
  );
};

const GlossaryInsertForm = ({ id }: { id: string }) => {
  const languageOptions = langEnum.enumValues
    .filter((language) => language !== 'chinese')
    .map((language) => ({
      label: language,
      value: language,
    }));

  return (
    <div className="flex max-h-[66vh] flex-col gap-4 overflow-y-auto px-4">
      <HiddenInput name="id" value={id} />
      <div className="grid grid-cols-2 gap-4">
        <FormSelect
          required
          name="language"
          label="Language"
          options={languageOptions}
          description="The language of the glossary."
        />
        <FormInput required label="Glossary" name={`glossary`} description="The glossary you want to insert." />
        <FormInput
          label="Sutra Name"
          name={'sutraName'}
          placeholder="佛教常用詞(default)"
          description="The sutra name of the glossary."
        />
        <FormInput label="Volume" name={'volume'} placeholder="-(default)" description="The volume of the glossary." />
        <FormInput
          name={'originSutraText'}
          label="Origin Sutra Text"
          description="The origin sutra text of the glossary."
        />
        <FormInput
          name={'targetSutraText'}
          label="Target Sutra Text"
          description="The target sutra text of the glossary."
        />
        <FormInput label="Phonetic" name={`phonetic`} description="The phonetic of the glossary." />
        <FormInput
          label="Author"
          name={`author`}
          placeholder="翻譯團隊(default)"
          description="The author of the glossary."
        />
      </div>
    </div>
  );
};
