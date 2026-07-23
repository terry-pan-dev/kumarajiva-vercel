// Translation workspace, backed by the refactored data model (work / document /
// section / paragraphs_new): origin paragraphs come from the source document's
// section, translations live in the project's target document and are paired
// by passage_key instead of parent_id.
//
// Comments, references and history still hang off the legacy tables (viewable
// via the legacy /data/paragraphs debug page) and return here once they
// migrate.
import { useActionData, useLoaderData, useOutletContext, useRouteError } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { motion } from 'framer-motion';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ZodError } from 'zod';

import { assertAuthUser } from '~/auth.server';
import ContextMenuWrapper from '~/components/ContextMenu';
import { ErrorInfo } from '~/components/ErrorInfo';
import { Paragraph } from '~/components/Paragraph';
import { DragPanel, LeftPanel, RightPanel } from '~/components/translation/panels';
import { Workspace } from '~/components/translation/Workspace';
import { Label, RadioGroup, RadioGroupItem, ResizableHandle, ScrollArea } from '~/components/ui';
import { type ReadUser } from '~/drizzle/tables/user';
import { useScreenSize } from '~/lib/hooks/useScreenSizeHook';
import { validatePayloadOrThrow } from '~/lib/payload.validation';
import { getProjectBySourceDocumentId } from '~/services/project.service';
import {
  getSection,
  insertParagraph,
  readParagraphsBySectionId,
  resolveTranslationTarget,
  updateParagraph,
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
      // the section matching this source section's order. Both must already
      // exist — sections are never created implicitly.
      const target = await resolveTranslationTarget(sectionId as string);
      if (!target.ok) {
        if (target.reason === 'section-not-found') {
          throw new Error('Section not found');
        }
        const message =
          target.reason === 'no-project'
            ? 'No translation project is set up for this document.'
            : 'The translation section has not been created yet. Create and name it in Data Management → Translation Projects first.';
        return json({ success: false, errors: [{ message }] }, { status: 400 });
      }

      await insertParagraph({
        sourceId: result.paragraphId,
        documentId: target.targetDocumentId,
        sectionId: target.targetSectionId,
        newParagraph: {
          content: result.translation,
          createdBy: user.id,
          updatedBy: user.id,
        },
      });
      return json({ success: true, message: 'Paragraph created successfully', kind: 'insert', id: result.paragraphId });
    }
    if (result.kind === 'update') {
      await updateParagraph({
        id: result.paragraphId,
        newContent: result.translation,
        updatedBy: user.id,
      });
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
