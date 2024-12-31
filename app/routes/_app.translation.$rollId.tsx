import { zodResolver } from '@hookform/resolvers/zod';
import { useFetcher, useLoaderData, useOutletContext, useRouteError } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { diffWords, diffSentences } from 'diff';
import { motion } from 'framer-motion';
import { ChevronsDownUp, ChevronsUpDown, Copy, Info } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { FormProvider, useForm, useFormContext } from 'react-hook-form';
import { ZodError, type z } from 'zod';

import { Icons } from '~/components/icons';
import { type ReadReference } from '~/drizzle/tables/reference';
import { type ReadUser } from '~/drizzle/tables/user';

import type { ReadGlossary } from '../../drizzle/schema';
import type { ReadHistory } from '../../drizzle/tables/paragraph';

import { assertAuthUser } from '../auth.server';
import { Can } from '../authorisation';
import ContextMenuWrapper from '../components/ContextMenu';
import { ErrorInfo } from '../components/ErrorInfo';
import { Paragraph } from '../components/Paragraph';
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RadioGroup,
  RadioGroupItem,
  ResizableHandle,
  Separator,
  ResizablePanel,
  ResizablePanelGroup,
  ScrollArea,
  Textarea,
} from '../components/ui';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '../components/ui/hover-card';
import { useToast } from '../hooks/use-toast';
import { validatePayloadOrThrow } from '../lib/payload.validation';
import { readParagraphsByRollId, upsertParagraph, type IParagraph } from '../services/paragraph.service';
import { readRollById } from '../services/roll.service';
import { paragraphActionSchema } from '../validations/paragraph.validation';

export async function loader({ params, request }: LoaderFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  const { rollId } = params;
  const paragraphs = await readParagraphsByRollId({ rollId: rollId as string, user });
  const rollInfo = await readRollById(rollId as string);

  return json({ success: true, paragraphs: paragraphs ?? [], rollInfo });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { rollId } = params;
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  const formData = Object.fromEntries(await request.formData());

  try {
    const result = validatePayloadOrThrow({ schema: paragraphActionSchema, formData });
    await upsertParagraph({
      content: result.translation,
      rollId: rollId as string,
      parentId: result.paragraphId,
      createdBy: user.id,
      updatedBy: user.id,
      language: user.targetLang,
    });
  } catch (error) {
    console.log({ error });
    if (error instanceof ZodError) {
      return json({ success: false, errors: error.message }, { status: 400 });
    }
    throw new Error('Failed to create paragraph');
  }
  return json({ success: true, paragraphs: [] });
}

export function ErrorBoundary() {
  const error = useRouteError();

  return <ErrorInfo error={error} />;
}
export default function TranslationRoll() {
  const { paragraphs, rollInfo } = useLoaderData<typeof loader>();

  const labelRef = useRef<HTMLLabelElement>(null);

  const [selectedParagraphIndex, setSelectedParagraphIndex] = useState<string | null>(null);

  useEffect(() => {
    if (selectedParagraphIndex && labelRef.current) {
      setTimeout(() => {
        labelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [selectedParagraphIndex]);

  useEffect(() => {
    const firstNotSelectedNode = paragraphs.find((p) => !p.target);
    if (firstNotSelectedNode) {
      const node = document.getElementById(firstNotSelectedNode.id);
      if (node) {
        setTimeout(() => {
          node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    }
  }, [paragraphs]);

  const paragraphsWithHistory = useMemo(() => {
    return paragraphs.map((paragraph) => ({
      ...paragraph,
      references: paragraph.references.map((reference) => ({
        ...reference,
        createdAt: new Date(reference.createdAt),
        updatedAt: new Date(reference.updatedAt),
        deletedAt: reference.deletedAt ? new Date(reference.deletedAt) : null,
      })),
      histories: paragraph.histories.map((history) => ({ ...history, updatedAt: new Date(history.updatedAt) })),
    }));
  }, [paragraphs]);

  const Paragraphs = paragraphsWithHistory.map((paragraph) => (
    <div key={paragraph.id} className="flex items-center gap-4 px-2">
      {paragraph?.target ? (
        <div className={`${selectedParagraphIndex ? 'flex flex-col' : 'grid grid-cols-2'} w-full gap-4`}>
          <ContextMenuWrapper>
            <Paragraph isOrigin text={paragraph.origin} />
          </ContextMenuWrapper>
          <Label
            className="flex h-auto text-md font-normal"
            onDoubleClick={() => setSelectedParagraphIndex(paragraph.id)}
            ref={selectedParagraphIndex === paragraph.id ? labelRef : undefined}
          >
            <ContextMenuWrapper>
              <div className="relative h-full">
                <Paragraph text={paragraph.target} />
                <ParagraphHistory histories={paragraph.histories} />
              </div>
            </ContextMenuWrapper>
          </Label>
        </div>
      ) : (
        <motion.div
          whileHover={{ scale: 1.01 }}
          transition={{ duration: 0.3 }}
          className="flex w-full items-center gap-2"
        >
          <RadioGroupItem
            id={paragraph.id}
            value={paragraph.id}
            className={`${selectedParagraphIndex === paragraph.id ? 'bg-primary' : ''}`}
          />
          <Label
            htmlFor={paragraph.id}
            className="w-full text-md font-normal"
            ref={selectedParagraphIndex === paragraph.id ? labelRef : undefined}
          >
            <ContextMenuWrapper>
              <Paragraph text={paragraph.origin} />
            </ContextMenuWrapper>
          </Label>
        </motion.div>
      )}
    </div>
  ));

  if (selectedParagraphIndex) {
    const selectedParagraph = paragraphsWithHistory.find((p) => p.id === selectedParagraphIndex)!;

    return (
      <DragPanel>
        <LeftPanel>
          <ScrollArea className="h-full w-full pr-4">
            <RadioGroup className="gap-4" onValueChange={setSelectedParagraphIndex}>
              {Paragraphs}
            </RadioGroup>
          </ScrollArea>
        </LeftPanel>
        <ResizableHandle withHandle className="bg-yellow-600" />
        <RightPanel>
          <ScrollArea className="h-full w-full pr-4">
            <Workspace paragraph={selectedParagraph} />
          </ScrollArea>
        </RightPanel>
      </DragPanel>
    );
  }

  return (
    <ScrollArea className="h-full px-2 lg:px-8">
      <RadioGroup className="gap-4" onValueChange={setSelectedParagraphIndex}>
        {paragraphs.length ? (
          <>
            <p className="text-center text-2xl">{rollInfo?.sutra.title}</p>
            <p className="text-center text-lg">{rollInfo?.title}</p>
          </>
        ) : null}
        {paragraphs.length ? (
          Paragraphs
        ) : (
          <div className="text-center text-lg">We are preparing paragraphs for you...</div>
        )}
      </RadioGroup>
    </ScrollArea>
  );
}

const Workspace = ({ paragraph }: { paragraph: IParagraph }) => {
  const { id, origin, target, references } = paragraph;
  const fetcher = useFetcher<{ success: boolean }>();

  const form = useForm<z.infer<typeof paragraphActionSchema>>({
    resolver: zodResolver(paragraphActionSchema),
    mode: 'onSubmit',
    defaultValues: {
      translation: target || '',
      paragraphId: id,
    },
  });

  const {
    register,
    formState: { errors, isDirty },
    handleSubmit,
    watch,
  } = form;

  const { toast } = useToast();

  useEffect(() => {
    if (errors.translation || errors.paragraphId) {
      toast({
        variant: errors.translation?.message ? 'warning' : errors.paragraphId?.message ? 'error' : 'default',
        title: 'Oops!',
        position: 'top-right',
        description: errors.translation?.message || errors.paragraphId?.message,
      });
    }
  }, [errors, toast]);

  const [disabledEdit, setDisabledEdit] = useState(false);

  useEffect(() => {
    if (fetcher.data?.success && form.getValues('translation')) {
      form.reset(
        {
          paragraphId: '',
          translation: '',
        },
        { keepDirty: true },
      );
      setDisabledEdit(true);
    }
  }, [fetcher, form]);

  useEffect(() => {
    if (form.getValues('paragraphId') !== id) {
      setDisabledEdit(false);
    }
    form.setValue('paragraphId', id, { shouldDirty: true });
  }, [form, id]);

  const onSubmit = (data: z.infer<typeof paragraphActionSchema>) => {
    fetcher.submit(data, { method: 'post' });
  };

  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const translation = watch('translation');

  useEffect(() => {
    if (textAreaRef.current) {
      textAreaRef.current.style.height = '0px';
      const scrollHeight = textAreaRef.current.scrollHeight + 10;

      textAreaRef.current.style.height = scrollHeight + 'px';
    }
  }, [textAreaRef, translation]);

  useEffect(() => {
    if (target && form.getValues('translation') !== '') {
      form.setValue('translation', target);
    } else {
      form.setValue('translation', '');
    }
  }, [target, form]);

  return (
    <FormProvider {...form}>
      <div className="flex h-full flex-col justify-start gap-4 px-1">
        <motion.div
          className="flex flex-col"
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          exit={{ opacity: 0, x: '100%' }}
          initial={{ opacity: 0, x: '100%' }}
        >
          <ContextMenuWrapper>
            <Paragraph text={origin} title="Origin" />
          </ContextMenuWrapper>
          <ContextMenuWrapper>
            <OpenAIStreamCard text={origin} title="OpenAI" />
          </ContextMenuWrapper>
        </motion.div>
        <References references={references} />
        <div className="flex-grow"></div>
        <fetcher.Form method="post" className="mt-auto" onSubmit={handleSubmit(onSubmit)}>
          <div className="mt-auto grid w-full gap-2">
            <input type="hidden" {...register('paragraphId')} />
            <Can I="Create" this="Paragraph">
              <Textarea
                className="h-8 text-md"
                disabled={disabledEdit}
                placeholder={disabledEdit ? 'Please select a new paragraph to edit.' : 'Type your translation here.'}
                {...register('translation')}
                ref={(e) => {
                  register('translation').ref(e);
                  textAreaRef.current = e;
                }}
              />
              <Button type="submit" disabled={translation === '' || !isDirty}>
                Save Translation
              </Button>
            </Can>
          </div>
        </fetcher.Form>
      </div>
    </FormProvider>
  );
};

const References = ({ references }: { references: ReadReference[] }) => {
  const [isOpen, setIsOpen] = React.useState(true);
  const formContext = useFormContext();

  const getButtons = (text: string) => {
    return (
      <Button
        size="icon"
        variant="ghost"
        className="transition-transform duration-300 hover:scale-110"
        onClick={() => formContext.setValue('translation', text, { shouldDirty: true })}
      >
        <Copy className="h-4 w-4" />
      </Button>
    );
  };
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full gap-2">
      <div className="flex items-center justify-between space-x-4 px-4">
        <h3 className="text-md font-semibold">References</h3>
        <CollapsibleTrigger asChild>
          <Button size="sm" variant="ghost">
            {isOpen ? <ChevronsDownUp className="h-4 w-4" /> : <ChevronsUpDown className="h-4 w-4" />}
            <span className="sr-only">Toggle</span>
          </Button>
        </CollapsibleTrigger>
      </div>
      {references.length ? (
        <WorkspaceCard
          text={references[0].content}
          title={references[0].sutraName}
          buttons={getButtons(references[0].content)}
        />
      ) : null}
      <CollapsibleContent className="gap-2">
        {references.length > 1
          ? references
              .slice(1)
              .map((reference) => (
                <WorkspaceCard
                  key={reference.id}
                  text={reference.content}
                  title={reference.sutraName}
                  buttons={getButtons(reference.content)}
                />
              ))
          : null}
      </CollapsibleContent>
    </Collapsible>
  );
};

const LeftPanel = ({ children }: PropsWithChildren) => {
  return (
    <ResizablePanel minSize={30} defaultSize={50}>
      <div className="flex h-full items-center justify-center pr-2">{children}</div>
    </ResizablePanel>
  );
};

const RightPanel = ({ children }: PropsWithChildren) => {
  return (
    <ResizablePanel minSize={40} defaultSize={50}>
      <div className="flex h-full items-center justify-center pb-2 pl-8">{children}</div>
    </ResizablePanel>
  );
};

const DragPanel = ({ children }: PropsWithChildren) => {
  return (
    <ResizablePanelGroup direction="horizontal" className="w-full rounded-lg">
      {children}
    </ResizablePanelGroup>
  );
};

interface StreamCardProps {
  text: string;
  title: string;
}

const OpenAIStreamCard = React.memo(({ text, title }: StreamCardProps) => {
  const context = useOutletContext<{ user: ReadUser }>();
  const formContext = useFormContext();
  const fetcher = useFetcher<{ success: boolean; glossaries: ReadGlossary[]; tokens: string[] }>();
  const loading = fetcher.state === 'loading' || fetcher.state === 'submitting';
  const [translationResult, setTranslationResult] = useState<string>('');
  const textRef = useRef<string>('');
  const abortController = new AbortController();
  const req = new Request(
    `/openai?origin=${text}&sourceLang=${context.user.originLang}&targetLang=${context.user.targetLang}`,
    {
      method: 'GET',
      signal: abortController.signal,
    },
  );

  const [glossaries, setGlossaries] = useState<ReadGlossary[]>([]);
  const [tokens, setTokens] = useState<string[]>([]);
  useEffect(() => {
    if (text) {
      fetcher.load(`/tokenizer?content=${text}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  useEffect(() => {
    if (fetcher.data?.success) {
      const glossaries = fetcher.data.glossaries.map((glossary) => ({
        ...glossary,
        createdAt: new Date(glossary.createdAt),
        updatedAt: new Date(glossary.updatedAt),
        deletedAt: glossary.deletedAt ? new Date(glossary.deletedAt) : null,
      }));
      setGlossaries(glossaries);
      setTokens(fetcher.data.tokens);
    }
  }, [fetcher.data]);

  useEffect(() => {
    setTranslationResult('');
    textRef.current = '';
    const condition = true;
    const fetchStream = async () => {
      try {
        const response = await fetch(req);
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        while (condition) {
          if (reader) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            const chunk = decoder.decode(value);
            setTranslationResult((prev) => prev + chunk);
            textRef.current += chunk;
          }
        }
      } catch (error) {
        console.error(`error in openai loader: ${error}`);
        if (error instanceof Error && error.name === 'AbortError') {
          console.info('user aborted the request');
        }
      }
    };

    fetchStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <>
      <WorkspaceCard
        title={title}
        text={translationResult}
        buttons={
          <>
            {loading ? <Icons.Loader className="h-4 w-4 animate-spin" /> : null}
            <PromptGlossaryInfo tokens={tokens} loading={loading} originSutraText={text} glossaries={glossaries} />
            <Button
              size="icon"
              variant="ghost"
              disabled={loading}
              className="transition-transform duration-300 hover:scale-110"
              onClick={() => formContext.setValue('translation', translationResult, { shouldDirty: true })}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </>
        }
      />
    </>
  );
});

interface WorkspaceCardProps {
  title: string;
  text: string;
  buttons?: React.ReactNode | undefined;
}

const WorkspaceCard = ({ title, text, buttons }: WorkspaceCardProps) => {
  return (
    <div className="mt-4 flex flex-col justify-start rounded-xl bg-card-foreground p-4 shadow-lg">
      <div className="flex items-center justify-between">
        <div className="text-md font-medium">{title}</div>
        <div className="flex items-center gap-2">{buttons}</div>
      </div>
      <p className="text-md text-slate-500">{text}</p>
    </div>
  );
};

export const ParagraphHistory = ({ histories }: { histories: ReadHistory[] }) => {
  return histories.length ? (
    <div className="absolute right-1 top-1">
      <ParagraphHistoryPopover>
        <ParagraphHistoryTimeline histories={histories} />
      </ParagraphHistoryPopover>
    </div>
  ) : null;
};

export const ParagraphHistoryPopover = ({ children }: PropsWithChildren) => {
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Button variant="link" className="h-6 w-6 p-0">
          <Icons.FileClock className="h-4 w-4" />
        </Button>
      </HoverCardTrigger>
      <HoverCardContent className="w-full max-w-xl lg:max-w-3xl">{children}</HoverCardContent>
    </HoverCard>
  );
};

interface ParagraphHistoryTimelineProps {
  histories: ReadHistory[];
}
export const ParagraphHistoryTimeline = ({ histories }: ParagraphHistoryTimelineProps) => {
  const { users } = useOutletContext<{ users: { id: string; username: string; email: string }[] }>();

  return (
    <div className="relative h-96 overflow-y-auto">
      {/* Container for timeline content with relative positioning */}
      <div className="relative min-h-full">
        {/* Vertical timeline line - now positioned relative to the content container */}
        <div className="absolute left-2 top-0 h-full w-[2px] bg-slate-300" />

        <div className="flex flex-col gap-4">
          {histories.map((history) => {
            const user = users.find((u) => u.id === history.updatedBy);

            // First get word diffs
            const wordDiffs = diffWords(history.oldContent, history.newContent);

            // Count changed words
            const changedWordCount = wordDiffs.reduce((count, diff) => {
              if (diff.added || diff.removed) {
                return count + diff.value.split(/\s+/).length;
              }
              return count;
            }, 0);

            // Choose final diffs based on word change count
            const diffs = changedWordCount > 5 ? diffSentences(history.oldContent, history.newContent) : wordDiffs;

            return (
              <div className="flex items-start gap-6 pl-4" key={history.updatedAt.toLocaleString()}>
                {/* Timeline dot */}
                <div className="relative -ml-[15px] mt-2 h-4 w-4">
                  <div className="absolute h-4 w-4 rounded-full border-2 border-slate-300 bg-white" />
                  <div className="absolute left-1 top-1 h-2 w-2 rounded-full bg-slate-300" />
                </div>

                {/* Content */}
                <div className="flex flex-col">
                  <span className="text-md text-slate-500">{history.updatedAt.toLocaleString()}</span>
                  <span className="text-md font-medium">{user?.username || 'Unknown user'}</span>
                  <pre className="mt-1 whitespace-pre-wrap text-sm">
                    <div className="grid grid-cols-2 gap-4 rounded bg-slate-50 p-2">
                      <div className="max-w-lg border-r border-slate-200 pr-4">
                        {diffs.map((diff, i) => (
                          <span
                            key={`old-${i}`}
                            className={diff.removed ? 'bg-red-100 text-red-800' : 'text-slate-600'}
                          >
                            {diff.added ? '' : diff.value}
                          </span>
                        ))}
                      </div>
                      <div className="max-w-lg">
                        {diffs.map((diff, i) => (
                          <span
                            key={`new-${i}`}
                            className={diff.added ? 'bg-green-100 text-green-800' : 'text-slate-600'}
                          >
                            {diff.removed ? '' : diff.value}
                          </span>
                        ))}
                      </div>
                    </div>
                  </pre>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const PromptGlossaryInfo = ({
  glossaries,
  originSutraText,
  tokens,
  loading,
}: {
  glossaries: ReadGlossary[];
  originSutraText: string;
  tokens: string[];
  loading: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const tableData = glossaries.map((glossary) => ({
    term: glossary.glossary,
    definition: glossary.translations?.map((translation) => translation.glossary) || [],
  }));
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" disabled={loading} className="h-8 w-8 rounded-full">
          <Info className="h-4 w-4" />
          <span className="sr-only">Open glossary</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side={'right'} className="w-[450px] p-0">
        <div className="rounded-t-lg bg-gray-100 p-4 dark:bg-gray-800">
          <h3 className="text-lg font-semibold">Glossary Info</h3>
          <p className="text-sm text-gray-500">(glossary maybe used in AI translation)</p>
        </div>
        <div className="p-4">
          <HighlightedParagraph text={originSutraText} keywords={glossaries.map((glossary) => glossary.glossary)} />
          <Separator className="my-4" />
          {tokens?.length ? <p className="text-sm text-gray-500">Tokens: {tokens.join(', ')}</p> : null}
          <Separator className="my-4" />
          <TableData data={tableData} />
        </div>
      </PopoverContent>
    </Popover>
  );
};

interface HighlightedParagraphProps {
  text: string;
  keywords: string[];
}

const HighlightedParagraph: React.FC<HighlightedParagraphProps> = ({ text, keywords }) => {
  const highlightText = (text: string, keywords: string[]) => {
    let highlightedText = text;

    // Sort keywords by length (longest first) to handle overlapping matches correctly
    const sortedKeywords = [...keywords].sort((a, b) => b.length - a.length);

    sortedKeywords.forEach((keyword) => {
      // Escape special regex characters and create word boundary for CJK characters
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');

      // Use positive lookbehind and lookahead for CJK word boundaries
      const pattern = `(${escapedKeyword})`;
      const regex = new RegExp(pattern, 'g');

      highlightedText = highlightedText.replace(regex, '<span class="bg-yellow-200 dark:bg-yellow-800">$1</span>');
    });

    return <p dangerouslySetInnerHTML={{ __html: highlightedText }} />;
  };

  return <div className="mb-4">{highlightText(text, keywords)}</div>;
};

interface TableDataProps {
  data: { term: string; definition: string[] }[];
}
const TableData: React.FC<TableDataProps> = ({ data }) => {
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="max-h-[300px] overflow-y-auto">
        <table className="w-full border-collapse">
          <tbody>
            {data.map((row, index) => (
              <tr key={index} className="border-b last:border-b-0">
                <td className="border-r p-2">{row.term}</td>
                <td className="p-2">
                  <ul className="list-disc pl-5">
                    {row.definition.map((item, itemIndex) => (
                      <li key={itemIndex}>{item}</li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
