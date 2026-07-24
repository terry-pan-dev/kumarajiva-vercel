// Translation workspace, backed by the refactored data model (work / document /
// section / paragraphs_new): origin paragraphs come from the source document's
// section, translations live in the project's target document and are paired
// by passage_key instead of parent_id.
//
// Comments, references and history still hang off the legacy tables (viewable
// via the legacy /data/paragraphs debug page) and return here once they
// migrate.
import { Form, useActionData, useLoaderData, useNavigation, useOutletContext, useRouteError } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { motion } from 'framer-motion';
import { Copy, Pencil, Check, X } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState, type PropsWithChildren, useCallback, Fragment } from 'react';
import Markdown from 'react-markdown';
import { ZodError } from 'zod';

import { assertAuthUser } from '~/auth.server';
import { Can } from '~/authorisation';
import ContextMenuWrapper from '~/components/ContextMenu';
import { ErrorInfo } from '~/components/ErrorInfo';
import { Icons } from '~/components/icons';
import { Paragraph } from '~/components/Paragraph';
import {
  Button,
  Label,
  RadioGroup,
  RadioGroupItem,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  ScrollArea,
  Textarea,
} from '~/components/ui';
import { type ReadUser } from '~/drizzle/tables/user';
import { useToast } from '~/hooks/use-toast';
import { useScreenSize } from '~/lib/hooks/useScreenSizeHook';
import { useTextAreaAutoHeight } from '~/lib/hooks/useTextAreaAutoHeight';
import { useTranslation } from '~/lib/hooks/useTranslation';
import { validatePayloadOrThrow } from '~/lib/payload.validation';
import { getProjectBySourceDocumentId } from '~/services/project.service';
import {
  findTargetSection,
  getSection,
  insertParagraph,
  readParagraphsBySectionId,
  updateParagraph,
  type IParagraphNew,
} from '~/services/text.service';
import { paragraphActionSchema } from '~/validations/paragraph.validation';

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
  const { sectionId } = params;
  const section = await getSection(sectionId as string);
  if (!section) {
    throw new Error('Section not found');
  }

  // Translations live in the project's target document, paired by passage_key.
  const project = await getProjectBySourceDocumentId(section.documentId);
  const paragraphs = await readParagraphsBySectionId({
    sectionId: sectionId as string,
    targetDocumentId: project?.targetDocumentId ?? undefined,
  });

  const sectionInfo = { documentTitle: section.document?.title ?? '', sectionTitle: section.title ?? null };

  return json({ success: true, paragraphs: paragraphs ?? [], sectionInfo });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { sectionId } = params;
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  const formData = Object.fromEntries(await request.formData());
  const kind = formData['kind'];

  // Handle updating origin paragraph content
  if (kind === 'updateOrigin') {
    try {
      const paragraphId = formData['paragraphId'] as string;
      const content = formData['originText'] as string;

      await updateParagraph({
        id: paragraphId,
        newContent: content,
        updatedBy: user.id,
      });

      return json({
        success: true,
        message: 'Origin text updated successfully',
        kind: 'updateOrigin',
        id: paragraphId,
        content,
      });
    } catch (error) {
      console.error('Error updating origin text:', error);
      if (error instanceof ZodError) {
        return json({ success: false, errors: error.errors }, { status: 400 });
      }
      return json({ success: false, message: 'Failed to update origin text' }, { status: 500 });
    }
  }

  // Comments still live on the legacy tables; they migrate in a later step.
  if (kind === 'createComment' || kind === 'updateComment') {
    return json(
      { success: false, errors: [{ message: 'Comments are not yet available for the new data model.' }] },
      { status: 400 },
    );
  }

  try {
    const result = validatePayloadOrThrow({ schema: paragraphActionSchema, formData });
    if (result.kind === 'insert') {
      // Resolve where the translation goes: the project's target document, in
      // the section matching this source section's order. The counterpart must
      // already exist (created and named in Data Management) — sections are
      // never created implicitly.
      const section = await getSection(sectionId as string);
      if (!section) {
        throw new Error('Section not found');
      }
      const project = await getProjectBySourceDocumentId(section.documentId);
      if (!project?.targetDocumentId) {
        return json(
          { success: false, errors: [{ message: 'No translation project is set up for this document.' }] },
          { status: 400 },
        );
      }
      const targetSection = await findTargetSection({
        sourceSection: { order: section.order },
        targetDocumentId: project.targetDocumentId,
      });
      if (!targetSection) {
        return json(
          {
            success: false,
            errors: [
              {
                message:
                  'The translation section has not been created yet. Create and name it in Data Management → Translation Projects first.',
              },
            ],
          },
          { status: 400 },
        );
      }

      console.time('insertParagraph');
      await insertParagraph({
        sourceId: result.paragraphId,
        documentId: project.targetDocumentId,
        sectionId: targetSection.id,
        newParagraph: {
          content: result.translation,
          createdBy: user.id,
          updatedBy: user.id,
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

export default function TranslationSection() {
  const { paragraphs, sectionInfo } = useLoaderData<typeof loader>();
  const actionData = useActionData<{ success: boolean; message: string; kind: 'insert' | 'update'; id: string }>();

  const divRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLLabelElement>(null);

  const { user } = useOutletContext<{ user: ReadUser }>();

  const [selectedParagraphIndex, setSelectedParagraphIndex] = useState<string | null>(null);
  const isSmallScreen = useScreenSize();
  const panelOrientation = isSmallScreen ? 'vertical' : 'horizontal';

  const selectedParagraph = useMemo(() => {
    if (selectedParagraphIndex) {
      return paragraphs.find((p) => p.id === selectedParagraphIndex)!;
    }
    return null;
  }, [selectedParagraphIndex, paragraphs]);

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

  const Paragraphs = paragraphs.map((paragraph, index) => (
    <div key={paragraph.id} className="flex items-center gap-6 px-4">
      {paragraph?.target ? (
        <div
          className={`${selectedParagraphIndex ? 'flex flex-col' : 'grid grid-cols-1 lg:grid-cols-2'} w-full gap-2 px-2 ${
            selectedParagraphIndex === paragraph.id
              ? 'rounded-xl bg-gradient-to-r from-yellow-600 to-slate-700 p-2 shadow-xl'
              : ''
          }`}
        >
          <div onDoubleClick={() => user.role !== 'reader' && setSelectedParagraphIndex(paragraph.id)}>
            <ContextMenuWrapper>
              <div className="relative">
                <span className="absolute top-4 left-1.5 z-10 text-sm font-medium text-yellow-600">{index + 1}</span>
                <Paragraph isOrigin comments={[]} id={paragraph.id} text={paragraph.origin} />
              </div>
            </ContextMenuWrapper>
          </div>
          <div
            className="text-md flex h-auto font-normal"
            ref={selectedParagraphIndex === paragraph.id ? divRef : undefined}
            onDoubleClick={() => user.role !== 'reader' && setSelectedParagraphIndex(paragraph.id)}
          >
            <ContextMenuWrapper>
              <div className="relative h-full">
                <Paragraph
                  comments={[]}
                  text={paragraph.target}
                  id={paragraph.targetId!}
                  isUpdate={
                    (selectedParagraphIndex === paragraph.id &&
                      actionData?.kind === 'update' &&
                      actionData.id === paragraph.targetId) ||
                    (actionData?.kind === 'insert' && actionData.id === paragraph.id)
                  }
                />
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
            className="text-md w-full font-normal"
            ref={selectedParagraphIndex === paragraph.id ? labelRef : undefined}
          >
            <ContextMenuWrapper>
              <div className="relative">
                <span className="absolute top-4 left-1.5 z-10 text-sm font-medium text-yellow-600">{index + 1}</span>
                <Paragraph
                  comments={[]}
                  id={paragraph.id}
                  text={paragraph.origin}
                  isSelected={selectedParagraphIndex === paragraph.id}
                />
              </div>
            </ContextMenuWrapper>
          </Label>
        </motion.div>
      )}
    </div>
  ));

  if (selectedParagraph) {
    return (
      <Fragment>
        <DragPanel orientation={panelOrientation}>
          <LeftPanel>
            <ScrollArea className="h-full w-full lg:pr-4">
              <RadioGroup
                className="gap-4"
                onValueChange={setSelectedParagraphIndex}
                value={selectedParagraphIndex ?? undefined}
              >
                {Paragraphs}
              </RadioGroup>
            </ScrollArea>
          </LeftPanel>
          <ResizableHandle withHandle orientation={panelOrientation} className="my-2 bg-yellow-600 lg:my-0" />
          <RightPanel>
            <ScrollArea className="h-full w-full lg:pr-4">
              <Workspace paragraph={selectedParagraph} />
            </ScrollArea>
          </RightPanel>
        </DragPanel>
      </Fragment>
    );
  }

  return (
    <Fragment>
      <ScrollArea className="h-full px-0 lg:px-4">
        <RadioGroup
          className="gap-4"
          onValueChange={setSelectedParagraphIndex}
          value={selectedParagraphIndex ?? undefined}
        >
          {paragraphs.length ? (
            <>
              <p className="text-center text-lg lg:text-2xl">{sectionInfo?.documentTitle}</p>
              <p className="text-md text-center lg:text-lg">{sectionInfo?.sectionTitle}</p>
            </>
          ) : null}
          {paragraphs.length ? (
            Paragraphs
          ) : (
            <div className="text-center text-lg">This section is still in preparation — no paragraphs yet.</div>
          )}
        </RadioGroup>
      </ScrollArea>
    </Fragment>
  );
}

// Only the fields the workspace uses — loader data is JSON-serialised, so the
// Date-typed relation arrays (empty until they migrate) are not part of it.
type WorkspaceParagraph = Pick<IParagraphNew, 'id' | 'origin' | 'target' | 'sectionId' | 'targetId'>;

const Workspace = ({ paragraph }: { paragraph: WorkspaceParagraph }) => {
  const { id, origin, target, sectionId, targetId } = paragraph;

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

  const [isEditingOrigin, setIsEditingOrigin] = useState(false);
  const [editedOrigin, setEditedOrigin] = useState(origin);

  useEffect(() => {
    setEditedOrigin(origin);
    setIsEditingOrigin(false);
  }, [origin]);

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

  const originRef = useTextAreaAutoHeight(editedOrigin);
  const translationRef = useTextAreaAutoHeight(translation);

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
          <div className="relative">
            {isEditingOrigin ? (
              <Form method="post" onSubmit={() => setIsEditingOrigin(false)}>
                <input name="kind" type="hidden" value="updateOrigin" />
                <input value={id} type="hidden" name="paragraphId" />
                <Textarea
                  ref={originRef}
                  name="originText"
                  className="text-md"
                  value={editedOrigin}
                  onChange={(e) => setEditedOrigin(e.target.value)}
                />
                <div className="mt-2 flex gap-2">
                  <Button size="icon" type="submit" variant="ghost" name="acceptEdit">
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    type="button"
                    variant="ghost"
                    name="cancelEdit"
                    onClick={() => {
                      setEditedOrigin(origin); // reset to original
                      setIsEditingOrigin(false);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </Form>
            ) : (
              <>
                <Paragraph id={id} text={origin} title="Origin" />
                <Can I="Update" this="OriginText">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute top-0 right-0"
                    onClick={() => setIsEditingOrigin(true)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </Can>
              </>
            )}
          </div>
        </ContextMenuWrapper>
        <Form method="post" className="mt-4" onSubmit={() => cleanTranslation()}>
          <div className="mt-auto grid w-full gap-2">
            <input type="hidden" name="paragraphId" value={targetId || id} />
            <input name="kind" type="hidden" value={targetId ? 'update' : 'insert'} />
            <Can I="Read" this="Paragraph">
              <Textarea
                name="translation"
                value={translation}
                ref={translationRef}
                className="text-md h-8"
                disabled={isLoading || disabledEdit}
                onChange={(e) => pasteTranslation(e.target.value)}
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
      <ContextMenuWrapper>
        <OpenAIStreamCard
          originId={id}
          text={origin}
          sectionId={sectionId}
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

const PANEL_IDS = { left: 'translation-left', right: 'translation-right' };
const DEFAULT_LAYOUT = { [PANEL_IDS.left]: 50, [PANEL_IDS.right]: 50 };

const LeftPanel = ({ children }: PropsWithChildren) => {
  return (
    <ResizablePanel minSize={30} defaultSize={50} id={PANEL_IDS.left}>
      <div className="flex h-full items-center justify-center pr-2">{children}</div>
    </ResizablePanel>
  );
};

const RightPanel = ({ children }: PropsWithChildren) => {
  return (
    <ResizablePanel minSize={40} defaultSize={50} id={PANEL_IDS.right}>
      <div className="flex h-full items-center justify-center pb-2 lg:pl-8">{children}</div>
    </ResizablePanel>
  );
};

const DragPanel = ({ children, orientation }: PropsWithChildren<{ orientation: 'horizontal' | 'vertical' }>) => {
  return (
    <ResizablePanelGroup orientation={orientation} defaultLayout={DEFAULT_LAYOUT} className="flex w-full rounded-lg">
      {children}
    </ResizablePanelGroup>
  );
};

interface StreamCardProps {
  text: string;
  title: string;
  originId: string;
  sectionId: string;
  disabled: boolean;
  interrupt: boolean;
  pasteTranslation: (text: string) => void;
}

const OpenAIStreamCard = React.memo(
  ({ text, title, originId, sectionId, disabled, pasteTranslation, interrupt }: StreamCardProps) => {
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
              // The endpoint's legacy body key; carries the section id in the
              // new data model.
              rollId: sectionId,
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
    <div className="bg-card-foreground mt-4 flex flex-col justify-start rounded-xl p-4 shadow-lg">
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
