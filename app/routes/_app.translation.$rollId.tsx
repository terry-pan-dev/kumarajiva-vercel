import { Form, useActionData, useLoaderData, useNavigation, useOutletContext, useRouteError } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { diffWords, diffSentences } from 'diff';
import { motion } from 'framer-motion';
import { ChevronsDownUp, ChevronsUpDown, Copy } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState, type PropsWithChildren, useCallback, Fragment } from 'react';
import Markdown from 'react-markdown';
import { ClientOnly } from 'remix-utils/client-only';
import { ZodError } from 'zod';

import { Icons } from '~/components/icons';
import { type ReadReference } from '~/drizzle/tables/reference';
import { type ReadUser } from '~/drizzle/tables/user';

import type { ReadHistory } from '../../drizzle/tables/paragraph';

import { assertAuthUser } from '../auth.server';
import { Can } from '../authorisation';
import { useCommentContext } from '../components/CommentContext';
import ContextMenuWrapper from '../components/ContextMenu';
import { ErrorInfo } from '../components/ErrorInfo';
import { Paragraph } from '../components/Paragraph';
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RadioGroup,
  RadioGroupItem,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  ScrollArea,
  Textarea,
} from '../components/ui';
import { useToast } from '../hooks/use-toast';
import { useScreenSize } from '../lib/hooks/useScreenSizeHook';
import { useTextAreaAutoHeight } from '../lib/hooks/useTextAreaAutoHeight';
import { useTranslation } from '../lib/hooks/useTranslation';
import { validatePayloadOrThrow } from '../lib/payload.validation';
import {
  createComment,
  insertParagraph,
  readParagraphsByRollId,
  updateComment,
  updateParagraph,
  type IParagraph,
} from '../services/paragraph.service';
import { readRollById } from '../services/roll.service';
import {
  createCommentActionSchema,
  paragraphActionSchema,
  updateCommentActionSchema,
} from '../validations/paragraph.validation';

export const config = {
  memory: 3009,
};

export function ErrorBoundary() {
  const error = useRouteError();
  return <ErrorInfo error={error} />;
}

export async function loader({ params, request }: LoaderFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  const { rollId } = params;
  const [paragraphs, rollInfo] = await Promise.all([
    readParagraphsByRollId({ rollId: rollId as string, user }),
    readRollById(rollId as string),
  ]);

  return json({ success: true, paragraphs: paragraphs ?? [], rollInfo });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { rollId } = params;
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  const formData = Object.fromEntries(await request.formData());
  const kind = formData['kind'];
  if (kind === 'createComment') {
    try {
      const result = validatePayloadOrThrow({ schema: createCommentActionSchema, formData });
      await createComment({
        rollId: rollId as string,
        paragraphId: result.paragraphId,
        selectedText: result.selectedText,
        messages: [
          {
            text: result.comment,
            userId: user.id,
            createdAt: new Date().toISOString(),
          },
        ],
        createdBy: user.id,
        updatedBy: user.id,
      });
      return json({ success: true, message: 'Comment added successfully', kind: 'createComment' });
    } catch (error) {
      if (error instanceof ZodError) {
        return json({ success: false, errors: error.errors }, { status: 400 });
      }
    }
  }

  if (kind === 'updateComment') {
    try {
      console.log({ formData });
      const result = validatePayloadOrThrow({ schema: updateCommentActionSchema, formData });
      console.log({ result });
      await updateComment({
        id: result.commentId,
        messages: result.message
          ? [{ text: result.message, userId: user.id, createdAt: new Date().toISOString() }]
          : [],
        resolved: result.resolved,
        updatedBy: user.id,
      });
      return json({ success: true, message: 'Comment updated successfully', kind: 'updateComment' });
    } catch (error) {
      console.log({ error });
      if (error instanceof ZodError) {
        return json({ success: false, errors: error.errors }, { status: 400 });
      }
    }
  }
  try {
    const result = validatePayloadOrThrow({ schema: paragraphActionSchema, formData });
    console.log({ result });
    if (result.kind === 'insert') {
      console.time('insertParagraph');
      await insertParagraph({
        parentId: result.paragraphId,
        newParagraph: {
          content: result.translation,
          rollId: rollId as string,
          createdBy: user.id,
          updatedBy: user.id,
          parentId: result.paragraphId,
          language: user.targetLang,
        },
      });
      console.timeEnd('insertParagraph');
      return json({ success: true, message: 'Paragraph created successfully', kind: 'insert', id: result.paragraphId });
    }
    if (result.kind === 'update') {
      console.time('updateParagraph');
      await updateParagraph({
        id: result.paragraphId,
        newContent: result.translation,
        updatedBy: user.id,
      });
      console.timeEnd('updateParagraph');
      return json({ success: true, message: 'Paragraph updated successfully', kind: 'update', id: result.paragraphId });
    }
  } catch (error) {
    console.log({ error });
    if (error instanceof ZodError) {
      return json({ success: false, errors: error.errors }, { status: 400 });
    }
    throw new Error('Failed to create paragraph');
  }
  return json({ success: true, paragraphs: [] });
}

export default function TranslationRoll() {
  const { paragraphs, rollInfo } = useLoaderData<typeof loader>();
  const actionData = useActionData<{ success: boolean; message: string; kind: 'insert' | 'update'; id: string }>();

  const divRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLLabelElement>(null);

  const { user } = useOutletContext<{ user: ReadUser }>();

  const [selectedParagraphIndex, setSelectedParagraphIndex] = useState<string | null>(null);

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
      originComments: paragraph.originComments.map((comment) => ({
        ...comment,
        createdAt: new Date(comment.createdAt),
        updatedAt: new Date(comment.updatedAt),
        deletedAt: comment.deletedAt ? new Date(comment.deletedAt) : null,
      })),
      targetComments: paragraph.targetComments.map((comment) => ({
        ...comment,
        createdAt: new Date(comment.createdAt),
        updatedAt: new Date(comment.updatedAt),
        deletedAt: comment.deletedAt ? new Date(comment.deletedAt) : null,
      })),
    }));
  }, [paragraphs]);

  const selectedParagraph = useMemo(() => {
    if (selectedParagraphIndex) {
      return paragraphsWithHistory.find((p) => p.id === selectedParagraphIndex)!;
    }
    return null;
  }, [selectedParagraphIndex, paragraphsWithHistory]);

  useEffect(() => {
    if (selectedParagraphIndex && (divRef.current || labelRef.current) && actionData?.kind !== 'update') {
      setTimeout(() => {
        divRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        labelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [selectedParagraphIndex, actionData]);

  useEffect(() => {
    const firstNotSelectedNode = paragraphs.find((p) => !p.target);
    if (firstNotSelectedNode) {
      const node = document.getElementById(firstNotSelectedNode.id);
      if (node && actionData?.kind !== 'update') {
        setTimeout(() => {
          node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    }
  }, [paragraphs, actionData]);

  const Paragraphs = paragraphsWithHistory.map((paragraph) => (
    <div key={paragraph.id} className="flex items-center gap-6 px-4">
      {paragraph?.target ? (
        <div
          className={`${selectedParagraphIndex ? 'flex flex-col' : 'grid grid-cols-1 lg:grid-cols-2'} w-full gap-6 px-2`}
        >
          <ContextMenuWrapper>
            <Paragraph
              isOrigin
              id={paragraph.id}
              text={paragraph.origin}
              comments={paragraph.originComments}
              isSelected={selectedParagraphIndex === paragraph.id}
            />
          </ContextMenuWrapper>
          <div
            className="flex h-auto text-md font-normal"
            ref={selectedParagraphIndex === paragraph.id ? divRef : undefined}
            onDoubleClick={() => user.role !== 'reader' && setSelectedParagraphIndex(paragraph.id)}
          >
            <ContextMenuWrapper>
              <div className="relative h-full">
                <Paragraph
                  text={paragraph.target}
                  id={paragraph.targetId!}
                  comments={paragraph.targetComments}
                  isUpdate={
                    (selectedParagraphIndex === paragraph.id &&
                      actionData?.kind === 'update' &&
                      actionData.id === paragraph.targetId) ||
                    (actionData?.kind === 'insert' && actionData.id === paragraph.id)
                  }
                />
                <Can I="Read" this="History">
                  <ParagraphHistory histories={paragraph.histories} />
                </Can>
              </div>
            </ContextMenuWrapper>
          </div>
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
            disabled={user.role === 'reader'}
            className={`h-3 w-3 lg:h-4 lg:w-4 ${selectedParagraphIndex === paragraph.id ? 'bg-primary' : ''}`}
          />
          <Label
            htmlFor={paragraph.id}
            className="w-full text-md font-normal"
            ref={selectedParagraphIndex === paragraph.id ? labelRef : undefined}
          >
            <ContextMenuWrapper>
              <Paragraph
                id={paragraph.id}
                text={paragraph.origin}
                comments={paragraph.originComments}
                isSelected={selectedParagraphIndex === paragraph.id}
              />
            </ContextMenuWrapper>
          </Label>
        </motion.div>
      )}
    </div>
  ));

  if (selectedParagraph) {
    return (
      <Fragment>
        <DragPanel>
          <LeftPanel>
            <ScrollArea className="h-full w-full lg:pr-4">
              <RadioGroup className="gap-4" onValueChange={setSelectedParagraphIndex}>
                {Paragraphs}
              </RadioGroup>
            </ScrollArea>
          </LeftPanel>
          <ResizableHandle withHandle className="my-2 bg-yellow-600 lg:my-0" />
          <RightPanel>
            <ScrollArea className="h-full w-full lg:pr-4">
              <Workspace paragraph={selectedParagraph} />
            </ScrollArea>
          </RightPanel>
        </DragPanel>
        <CommentModal />
      </Fragment>
    );
  }

  return (
    <Fragment>
      <ScrollArea className="h-full px-0 lg:px-4">
        <RadioGroup className="gap-4" onValueChange={setSelectedParagraphIndex}>
          {paragraphs.length ? (
            <>
              <p className="text-center text-lg lg:text-2xl">{rollInfo?.sutra.title}</p>
              <p className="text-center text-md lg:text-lg">{rollInfo?.title}</p>
            </>
          ) : null}
          {paragraphs.length ? (
            Paragraphs
          ) : (
            <div className="text-center text-lg">We are preparing paragraphs for you...</div>
          )}
        </RadioGroup>
      </ScrollArea>
      <CommentModal />
    </Fragment>
  );
}

const CommentModal = () => {
  const { openModal, setOpenModal } = useCommentContext();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [paragraphId, setParagraphId] = useState<string | undefined>(undefined);
  const [selectedText, setSelectedText] = useState<string>('');
  const actionData = useActionData<{
    success: boolean;
    message: string;
    kind: 'createComment';
    errors: ZodError['errors'];
  }>();
  const navigation = useNavigation();
  const isLoading = navigation.state === 'submitting' || navigation.state === 'loading';
  const { toast } = useToast();

  useEffect(() => {
    if (!actionData) return;
    if (!actionData?.success) {
      toast({
        variant: 'error',
        title: 'Oops!',
        position: 'top-right',
        description: actionData?.errors?.map((error) => error.message).join(', '),
      });
    }
    if (actionData?.success) {
      toast({
        variant: 'default',
        title: actionData.message,
        position: 'top-right',
      });
      setOpen(false);
      setComment('');
      setOpenModal(false);
    }
  }, [actionData, toast, setOpenModal]);

  useEffect(() => {
    if (openModal) {
      setOpen(true);
    }
  }, [openModal]);

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = document.getSelection();
      if (selection && selection.toString().length > 0) {
        // Find the closest parent element with a data-id attribute
        let element = selection.anchorNode as Element;
        while (element && element.nodeType !== Node.ELEMENT_NODE) {
          element = element.parentNode as Element;
        }

        // Find closest parent with data-id
        while (element && element.nodeType === Node.ELEMENT_NODE && !element.getAttribute('data-id')) {
          element = element.parentNode as Element;
        }

        if (element && element.nodeType === Node.ELEMENT_NODE) {
          const id = element.getAttribute('data-id');
          if (id) {
            setParagraphId(id);
          }
        }
      }

      if (selection && selection.toString().length > 0 && selection.anchorNode) {
        const selectedText = selection.toString().trim();

        // Only proceed if we have a text node
        if (selection.anchorNode.nodeType === Node.TEXT_NODE) {
          const nodeText = selection.anchorNode.textContent || '';

          // Get the actual start and end positions in the text node
          const start = Math.min(selection.anchorOffset, selection.focusOffset);
          const end = Math.max(selection.anchorOffset, selection.focusOffset);

          // Account for potential trimming in the selected text
          const trimmedLeftCount = selection.toString().length - selection.toString().trimStart().length;
          const actualStart = start + trimmedLeftCount;
          const actualEnd = end - (selection.toString().length - selectedText.length - trimmedLeftCount);

          // Create new text with backticks around the selected portion
          const newText = nodeText.substring(0, actualStart) + '`' + selectedText + '`' + nodeText.substring(actualEnd);

          setSelectedText(newText);
        } else {
          // If not a text node, just use the selected text
          setSelectedText(selectedText);
        }
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);

    // Cleanup event listener on component unmount
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  return (
    <ClientOnly fallback={<div>Loading...</div>}>
      {() => (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="lg:max-w-4xl" aria-describedby="form-modal-description">
            <DialogHeader>
              <DialogTitle>Add Comment</DialogTitle>
              <DialogDescription className="hidden">Comment</DialogDescription>
            </DialogHeader>
            <Markdown
              components={{
                code: ({ node, ...props }) => (
                  <code {...props} className="bg-yellow-200">
                    {props.children}
                  </code>
                ),
              }}
            >
              {selectedText}
            </Markdown>
            <Form method="post">
              <input type="hidden" name="paragraphId" value={paragraphId} />
              <input name="kind" type="hidden" value="createComment" />
              <input type="hidden" name="selectedText" value={selectedText} />
              <Textarea name="comment" value={comment} onChange={(e) => setComment(e.target.value)} />
              <div className="h-4" />
              <DialogFooter className="gap-2">
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isLoading}
                    onClick={() => {
                      setOpen(false);
                      setOpenModal(false);
                    }}
                  >
                    Close
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={isLoading || comment === ''}>
                  Save
                </Button>
              </DialogFooter>
            </Form>
          </DialogContent>
        </Dialog>
      )}
    </ClientOnly>
  );
};

const Workspace = ({ paragraph }: { paragraph: IParagraph }) => {
  const { id, origin, target, references, rollId, targetId } = paragraph;

  const { translation, pasteTranslation, disabledEdit, cleanTranslation } = useTranslation({ originId: id, target });

  const actionData = useActionData<{
    success: boolean;
    message: string;
    kind: 'insert' | 'update';
    errors: ZodError['errors'];
  }>();

  const navigation = useNavigation();

  const isLoading = navigation.state === 'submitting' || navigation.state === 'loading';

  const { toast } = useToast();

  useEffect(() => {
    if (!actionData) return;
    if (actionData.success) {
      toast({
        variant: 'default',
        title: actionData.message,
        position: 'top-right',
        description: actionData.message,
      });
    } else {
      toast({
        variant: 'error',
        title: 'Oops!',
        position: 'top-right',
        description: actionData.errors?.map((error) => error.message).join(', '),
      });
    }
  }, [actionData, toast]);

  const textAreaRef = useTextAreaAutoHeight(translation);

  return (
    <div className="flex h-full flex-col justify-start gap-4 px-1">
      <motion.div
        className="flex flex-col"
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
        exit={{ opacity: 0, x: '100%' }}
        initial={{ opacity: 0, x: '100%' }}
      >
        <ContextMenuWrapper>
          <Paragraph id={id} text={origin} title="Origin" />
        </ContextMenuWrapper>
        <Form method="post" className="mt-4" onSubmit={() => cleanTranslation()}>
          <div className="mt-auto grid w-full gap-2">
            <input type="hidden" name="paragraphId" value={targetId || id} />
            <input name="kind" type="hidden" value={targetId ? 'update' : 'insert'} />
            <Can I="Read" this="Paragraph">
              <Textarea
                name="translation"
                value={translation}
                className="h-8 text-md"
                disabled={isLoading || disabledEdit}
                onChange={(e) => pasteTranslation(e.target.value)}
                ref={(e) => {
                  textAreaRef.current = e;
                }}
                placeholder={
                  disabledEdit
                    ? 'Please select a new paragraph to edit or double click translated paragraph.'
                    : 'Type your translation here.'
                }
              />
              <Button type="submit" disabled={translation === '' || isLoading}>
                {isLoading ? <Icons.Loader className="h-4 w-4 animate-spin" /> : 'Save Translation'}
              </Button>
            </Can>
          </div>
        </Form>
      </motion.div>
      <References references={references} pasteTranslation={pasteTranslation} />
      <ContextMenuWrapper>
        <OpenAIStreamCard
          originId={id}
          text={origin}
          rollId={rollId}
          title="AI Translation"
          disabled={disabledEdit}
          pasteTranslation={pasteTranslation}
          interrupt={navigation.state === 'submitting'}
        />
      </ContextMenuWrapper>
      <div className="flex-grow"></div>
    </div>
  );
};

const References = ({
  references,
  pasteTranslation,
}: {
  references: ReadReference[];
  pasteTranslation: (text: string) => void;
}) => {
  const [isOpen, setIsOpen] = React.useState(true);

  const getButtons = (text: string) => {
    return (
      <Button
        size="icon"
        variant="ghost"
        onClick={() => pasteTranslation(text)}
        className="transition-transform duration-300 hover:scale-110"
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
      <div className="flex h-full items-center justify-center pb-2 lg:pl-8">{children}</div>
    </ResizablePanel>
  );
};

const DragPanel = ({ children }: PropsWithChildren) => {
  const isSmallScreen = useScreenSize();
  return (
    <ResizablePanelGroup
      className="flex w-full rounded-lg lg:flex-row"
      direction={isSmallScreen ? 'vertical' : 'horizontal'}
    >
      {children}
    </ResizablePanelGroup>
  );
};

interface StreamCardProps {
  text: string;
  title: string;
  originId: string;
  rollId: string;
  disabled: boolean;
  interrupt: boolean;
  pasteTranslation: (text: string) => void;
}

const OpenAIStreamCard = React.memo(
  ({ text, title, originId, rollId, disabled, pasteTranslation, interrupt }: StreamCardProps) => {
    const [translationResult, setTranslationResult] = useState<string>('');
    const [refresh, setRefresh] = useState(false);
    const [loading, setLoading] = useState(false);
    const textRef = useRef<string>('');

    // Add AbortController ref to manage request lifecycle
    const abortControllerRef = useRef<AbortController | null>(null);

    // Cleanup function to abort ongoing requests
    const cleanupStream = useCallback(() => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    }, []);

    // Cleanup on unmount or text change
    useEffect(() => {
      return () => cleanupStream();
    }, [cleanupStream]);

    useEffect(() => {
      if (interrupt) {
        abortControllerRef.current?.abort();
        setLoading(false);
      }
    }, [interrupt]);

    useEffect(() => {
      setTranslationResult('');
      textRef.current = '';

      // Clean up previous stream before starting new one
      cleanupStream();

      const fetchStream = async () => {
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined = undefined;
        try {
          // Create new AbortController for this request
          abortControllerRef.current = new AbortController();

          const req = new Request(`/openai`, {
            method: 'POST',
            body: JSON.stringify({
              origin: text,
              originId,
              rollId,
            }),
            // Add signal to request
            signal: abortControllerRef.current.signal,
          });

          const response = await fetch(req);
          reader = response.body?.getReader();
          const decoder = new TextDecoder();

          while (true) {
            if (!reader) break;

            const { done, value } = await reader.read();
            if (done) break;

            // Check if request was aborted
            if (abortControllerRef.current?.signal.aborted) {
              throw new Error('Stream aborted');
            }

            const chunk = decoder.decode(value);
            setTranslationResult((prev) => prev + chunk);
            textRef.current += chunk;
          }
        } catch (error) {
          console.error(`error in openai loader: ${error}`);
          if (error instanceof Error && error.name === 'AbortError') {
            console.info('Stream aborted by user');
          }
        } finally {
          if (reader) {
            reader.releaseLock();
            setLoading(false);
          }
        }
      };

      if ((refresh || text) && !disabled) {
        setLoading(true);
        abortControllerRef.current?.abort();
        fetchStream();
      }
      setRefresh(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [text, refresh, cleanupStream, disabled]);

    return (
      <>
        <WorkspaceCard
          title={title}
          text={translationResult}
          buttons={
            <>
              {loading ? <Icons.Loader className="h-4 w-4 animate-spin" /> : null}
              {/* <PromptGlossaryInfo tokens={tokens} loading={loading} originSutraText={text} glossaries={glossaries} /> */}
              <Button size="icon" variant="ghost" disabled={loading} onClick={() => setRefresh(true)}>
                <Icons.Refresh className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                disabled={loading}
                onClick={() => pasteTranslation(translationResult)}
                className="transition-transform duration-300 hover:scale-110"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </>
          }
        />
      </>
    );
  },
);

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
        <div className="flex items-center">{buttons}</div>
      </div>
      <Markdown
        components={{
          h3(props) {
            return <h3 className="text-md font-semibold" {...props} />;
          },
          p(props) {
            return <p className="text-md text-slate-500" {...props} />;
          },
          code(props) {
            return <span className="rounded bg-yellow-200 px-1" {...props} />;
          },
        }}
      >
        {text}
      </Markdown>
    </div>
  );
};

export const ParagraphHistory = ({ histories }: { histories: ReadHistory[] }) => {
  return histories.length ? (
    <div className="absolute left-1 top-4">
      <ParagraphHistoryPopover>
        <ParagraphHistoryTimeline histories={histories} />
      </ParagraphHistoryPopover>
    </div>
  ) : null;
};

export const ParagraphHistoryPopover = ({ children }: PropsWithChildren) => {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <Popover modal={true} open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="link"
          className="h-6 w-6 p-0"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(true); // Manually open since we are stopping propagation
          }}
        >
          <Icons.FileClock className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-full max-w-xl lg:max-w-3xl"
        onPointerDownOutside={(event) => {
          setIsOpen(false);
        }}
      >
        {children}
      </PopoverContent>
    </Popover>
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
                    <div className="grid-col-1 grid gap-4 rounded bg-slate-50 p-2 lg:grid-cols-2">
                      <div className="max-w-md border-r border-slate-200 pr-4 lg:max-w-lg">
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
