import { ChevronRight } from 'lucide-react';
import React, { useCallback, useMemo, useState, useRef } from 'react';
import { ClientOnly } from 'remix-utils/client-only';

import { Can } from '~/authorisation';
import { DeleteEntityButton } from '~/components/data/DeleteEntityButton';
import { Icons } from '~/components/icons';
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
} from '~/components/ui';
import { Divider } from '~/components/ui/divider';
import { type GlossaryEntry } from '~/services/glossary.types';
import { glossaryEditFormSchema } from '~/validations/glossary.validation';

import { FormModal, HiddenInput } from './FormModal';
import { SourceTermFields, TranslationsFields } from './GlossaryForm';
import { Spacer } from './ui/spacer';

interface GlossaryListProps {
  glossaries: GlossaryEntry[];
  // ShowEdit is useful when in the screen that people not allowed to edit glossary
  showEdit?: boolean;
}

export const GlossaryList = React.forwardRef<HTMLDivElement, GlossaryListProps>(
  ({ glossaries, showEdit = true }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState<number>(0);

    const selectedGlossary = useMemo(() => {
      // Clamped so deleting the last entry in the list selects its predecessor.
      return glossaries[Math.min(selectedIndex, glossaries.length - 1)];
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
  glossary: GlossaryEntry;
}

export function GlossaryItem({ glossary }: GlossaryItemProps) {
  return (
    <Card className="w-full cursor-pointer transition-all duration-300 ease-in-out hover:shadow-md">
      <CardContent className="flex items-center space-x-4 p-4 sm:p-6">
        <div className="min-w-0 flex-1">
          <h3 className="text-primary mb-2 truncate text-lg font-semibold sm:text-xl">{glossary.sourceTerm}</h3>
          {glossary.translations?.map((translation, index) => {
            return (
              <p key={index} className="text-muted-foreground line-clamp-2 text-sm">
                {translation.term}
              </p>
            );
          })}
        </div>
        <ChevronRight className="text-muted-foreground h-5 w-5 flex-shrink-0" />
      </CardContent>
    </Card>
  );
}

// The same prompt wherever a translation's discussion is entered: create, edit and insert.
export const GlossaryDetail = ({ glossary, showEdit = false }: { glossary: GlossaryEntry; showEdit?: boolean }) => {
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
        {showEdit && (
          <CardHeader className="flex-row items-center justify-end px-2 py-4">
            <div className="flex">
              <Can I="Update" this="Glossary">
                <FormModal
                  kind="edit"
                  fetcherKey="edit-glossary"
                  title="Update Glossary Entry"
                  schema={glossaryEditFormSchema}
                  trigger={
                    <Button size="icon" variant="ghost" aria-label="edit-glossary">
                      <Icons.SquarePen className="h-6 w-6 text-slate-800" />
                    </Button>
                  }
                  defaultValues={{
                    id: glossary?.id,
                    sourceTerm: glossary.sourceTerm,
                    cbetaFrequency: glossary.cbetaFrequency || '',
                    phonetic: glossary.phonetic || '',
                    // Each translation keeps its id from here to the save (glossaryEditFormSchema
                    // passes it through), so the save edits it in place. No input needed for it.
                    translations: (glossary.translations || []).map((translation) => ({
                      ...translation,
                      discussion: translation.discussion ?? null,
                    })),
                    baseTranslationIds: glossary.translations.flatMap((translation) => translation.id ?? []),
                  }}
                >
                  <GlossaryEditForm id={glossary.id} />
                </FormModal>
              </Can>
              <Can I="Maintain" this="Glossary">
                <span className="flex h-10 w-10 items-center justify-center">
                  <DeleteEntityButton
                    size={24}
                    id={glossary.id}
                    idName="glossaryId"
                    entity="glossaryEntry"
                    intent="delete-glossary"
                    // Also rendered on /settings, whose action knows nothing about glossaries.
                    action="/glossary?index"
                    label={glossary.sourceTerm}
                    description={`This moves “${glossary.sourceTerm}” and all ${glossary.translations?.length ?? 0} of its translations to the trash. It disappears from the glossary and search; an admin can restore it or delete it for good from the Glossary Inspector.`}
                  />
                </span>
              </Can>
            </div>
          </CardHeader>
        )}
        <CardContent className="flex-grow px-4">
          <div className="my-2 flex items-end justify-start gap-2">
            <h2 className="text-primary text-xl font-semibold tracking-tight lg:text-3xl">{glossary.sourceTerm}</h2>
            {glossary.phonetic && (
              <h2 className="text-md text-secondary-foreground font-mono">({glossary.phonetic})</h2>
            )}
            <div className="ml-auto" />
            {glossary.discussion && (
              <Tooltip>
                <span className="inline-block align-middle">
                  <TooltipTrigger aria-label="discussion">
                    <Icons.Discussion className="text-primary h-6 w-6" />
                  </TooltipTrigger>
                </span>
                <TooltipContent side="right" role="tooltip" aria-label="discussion tooltip">
                  <p>{glossary.discussion}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {glossary.translations?.map((translation, index) => {
            const sourceText = highlightKeyword({ text: translation.sourceText, keyword: glossary.sourceTerm });
            const targetText = highlightKeyword({
              text: translation.targetText,
              keyword: translation.term,
            });
            return (
              <div key={`${glossary.id}-${index}`}>
                <Divider className="text-primary py-1 lg:py-3">{translation.language.toUpperCase()}</Divider>
                {(translation.sourceName || translation.volume) && (
                  <Badge variant="default" className="mb-2 w-fit font-mono text-xs font-medium">
                    {[translation.sourceName, translation.volume].filter(Boolean).join(' | ')}
                  </Badge>
                )}
                {sourceText && (
                  <div className="flex items-center gap-2">
                    <Icons.Book className="h-4 w-4 flex-shrink-0 text-slate-800" />
                    <h3 className="text-muted-foreground text-sm font-medium">{sourceText}</h3>
                  </div>
                )}
                <Spacer />
                <h2 className="text-primary mb-2 text-xl font-semibold tracking-tight lg:text-2xl">
                  {translation.term}
                </h2>
                {targetText && (
                  <div className="flex items-center gap-2">
                    <Icons.Book className="h-4 w-4 flex-shrink-0 text-slate-800" />
                    <h3 className="text-muted-foreground text-sm font-medium">{targetText}</h3>
                  </div>
                )}
                {translation.discussion && (
                  <div aria-label="discussion" className="border-primary/40 mt-2 border-l-2 pl-3">
                    <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                      Discussion
                    </span>
                    <p className="text-sm whitespace-pre-wrap">{translation.discussion}</p>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
        <Separator className="px-2" />
        <CardFooter className="text-muted-foreground flex items-center justify-between p-2 text-sm lg:flex-row lg:justify-around lg:p-6 lg:pt-6">
          <div className="flex items-center gap-2 rounded-lg border-2 border-gray-500 px-2 py-1">
            <span className="text-muted-foreground text-xs font-medium">CBETA</span>
            <span className="text-muted-foreground text-xs font-medium">|</span>
            <span title="cbeta-frequency" className="text-muted-foreground text-xs font-bold">
              {glossary.cbetaFrequency}
            </span>
          </div>
          {/* <div className="flex flex-col gap-2 md:flex-row"> */}
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

// Adding a translation is part of the edit: "+ Add translation" appends one, saved with the rest.
const GlossaryEditForm = ({ id }: { id: string }) => {
  return (
    <div className="flex max-h-[66vh] flex-col gap-4 overflow-y-auto px-4">
      <HiddenInput name="id" value={id} />
      <SourceTermFields />
      <TranslationsFields />
    </div>
  );
};
