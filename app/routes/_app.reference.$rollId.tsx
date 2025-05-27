import { Form, useActionData, useFetcher, useLoaderData, useNavigation } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';

import type { ReadReference } from '../../drizzle/schema';

import { assertAuthUser } from '../auth.server';
import { Paragraph } from '../components/Paragraph';
import { Button } from '../components/ui';
import { readParagraphsAndReferencesByRollId } from '../services/paragraph.service';
import { updateReference } from '../services/reference.service';

export async function loader({ params }: LoaderFunctionArgs) {
  const { rollId } = params;
  if (!rollId) {
    throw new Response('Roll ID not found', { status: 404 });
  }
  const originalParagraphs = await readParagraphsAndReferencesByRollId(rollId);
  return json({ success: true, paragraphs: originalParagraphs });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  const formData = await request.formData();
  const referenceId = formData.get('referenceId');
  const content = formData.get('content');

  if (!referenceId || typeof content !== 'string') {
    console.error('Missing referenceId or content', { referenceId, content });
    return json({ success: false, error: 'Missing referenceId or content', referenceId: null }, { status: 400 });
  }
  try {
    await updateReference({ id: referenceId as string, content: content, updatedBy: user.id });
    return json({ success: true, message: 'Reference updated successfully', referenceId });
  } catch (error) {
    console.error('reference update error', error instanceof Error ? error.stack : error);
    return json(
      { success: false, error: error instanceof Error ? error.message : String(error), referenceId: null },
      { status: 500 },
    );
  }
};

export default function ReferenceRoll() {
  const loaderData = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action | typeof loader>(); // Can be used for action or loader

  // Use fetcher.data if available (after a reload), otherwise use loaderData
  const paragraphs =
    fetcher.data && 'paragraphs' in fetcher.data && fetcher.data.paragraphs
      ? fetcher.data.paragraphs
      : loaderData.paragraphs;

  const reloadReferences = useCallback(() => {
    // Construct the current path for fetcher.load
    const currentPath = window.location.pathname;
    fetcher.load(currentPath);
  }, [fetcher]);

  return (
    <div className="flex flex-col gap-4">
      {paragraphs.map((paragraph) => (
        <div key={paragraph.id}>
          <Paragraph isOrigin id={paragraph.id} text={paragraph.content} />
          <div className="h-2" />
          <div className="flex flex-col justify-between gap-2">
            {paragraph.references.map((reference) => (
              <EditableReferenceWrapper
                key={reference.id}
                reference={reference}
                onSuccessfulUpdate={reloadReferences}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface EditableReferenceWrapperProps {
  reference: Omit<ReadReference, 'createdAt' | 'updatedAt' | 'deletedAt'>;
  onSuccessfulUpdate: () => void;
}

function EditableReferenceWrapper({ reference, onSuccessfulUpdate }: EditableReferenceWrapperProps) {
  const [currentText, setCurrentText] = useState<string>(reference.content);
  const [historyStack, setHistoryStack] = useState<string[]>([reference.content]);
  const [selectedTextRange, setSelectedTextRange] = useState<{ start: number; end: number } | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting' || navigation.state === 'loading';

  // Effect to reset state when the underlying reference content changes (e.g., after a reload)
  useEffect(() => {
    setCurrentText(reference.content);
    setSelectedTextRange(null);
  }, [reference.content]);

  const isCurrentTextChanged = currentText !== reference.content;

  // Auto-resize textarea when content changes (but avoid during active selection)
  useEffect(() => {
    if (textAreaRef.current && !selectedTextRange) {
      textAreaRef.current.style.height = 'auto';
      textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`;
    }
  }, [currentText, selectedTextRange]);

  const handleSelectionChange = () => {
    // Add a small delay to ensure selection is stable
    setTimeout(() => {
      if (textAreaRef.current) {
        const { selectionStart, selectionEnd } = textAreaRef.current;
        if (selectionStart !== selectionEnd) {
          setSelectedTextRange({ start: selectionStart, end: selectionEnd });
        } else {
          setSelectedTextRange(null);
        }
      }
    }, 50);
  };

  const handleHighlight = () => {
    if (textAreaRef.current && selectedTextRange && selectedTextRange.start !== selectedTextRange.end) {
      const { start, end } = selectedTextRange;
      const newText =
        currentText.substring(0, start) + '`' + currentText.substring(start, end) + '`' + currentText.substring(end);
      setCurrentText(newText);
      setHistoryStack((prev) => [...prev, currentText]);

      // After highlighting, clear selection and focus textarea for next action
      setSelectedTextRange(null);
      setTimeout(() => {
        if (textAreaRef.current) {
          textAreaRef.current.focus();
          // Place cursor after the highlighted section
          const newCursorPos = start + (end - start) + 2; // +2 for the backticks
          textAreaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    }
  };

  const handleUndo = () => {
    setCurrentText(historyStack[historyStack.length - 1]);
    setHistoryStack(historyStack.slice(0, -1));
  };

  useEffect(() => {
    if (!actionData) return;
    if (actionData.success && actionData.referenceId === reference.id) {
      setHistoryStack([reference.content]);
    }
  }, [actionData, reference.id, reference.content]);

  return (
    <div className="w-full" key={reference.id}>
      <div className="flex overflow-hidden rounded-lg border border-gray-200 shadow-sm">
        {/* Form Panel */}
        <div className="flex flex-1 flex-col">
          <Form method="post" className="flex flex-1 flex-col">
            <h5 className="bg-primary p-2 text-white">
              {reference.sutraName}
              {actionData?.success && actionData?.referenceId === reference.id && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0] }}
                  className="ml-2 text-sm text-green-400"
                  transition={{ duration: 2, ease: 'easeInOut' }}
                >
                  Updated
                </motion.span>
              )}
            </h5>
            <input type="hidden" name="referenceId" value={reference.id} />
            <div className="relative flex-1 bg-white">
              <textarea
                name="content"
                ref={textAreaRef}
                value={currentText}
                disabled={isSubmitting}
                style={{ height: 'auto' }}
                onMouseUp={handleSelectionChange}
                placeholder={'Input Reference Here'}
                onChange={(e) => {
                  setCurrentText(e.target.value);
                }}
                className="min-h-[80px] w-full resize-none overflow-hidden border-none p-2 align-top sm:text-sm"
              />
            </div>
            <div className="flex items-center justify-end gap-2 bg-white p-3">
              {selectedTextRange && !isSubmitting && (
                <Button
                  size="sm"
                  type="button"
                  onClick={handleHighlight}
                  className="rounded bg-yellow-400 px-3 py-1.5 text-sm font-medium text-white transition-all duration-200 hover:bg-yellow-500"
                >
                  Highlight
                </Button>
              )}
              {historyStack.length > 1 ? (
                <Button
                  size="sm"
                  type="button"
                  onClick={handleUndo}
                  className="rounded bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-300/80 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                >
                  Undo
                </Button>
              ) : null}
              <Button
                size="sm"
                type="submit"
                disabled={!isCurrentTextChanged || isSubmitting}
                className="relative rounded bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/80 disabled:cursor-not-allowed disabled:bg-opacity-50"
              >
                Update
                {isCurrentTextChanged && !isSubmitting && (
                  <div className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-red-500"></div>
                )}
              </Button>
            </div>
          </Form>
        </div>

        {/* Preview panel */}
        <div className="flex flex-1 flex-col border-l border-gray-200">
          <div className="bg-primary p-2 text-white">
            <h5>Preview: {reference.sutraName}</h5>
          </div>
          <div className="flex-1 overflow-auto p-2 align-top sm:text-sm">
            <Markdown
              components={{
                code(props) {
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  const { node, ...rest } = props;
                  return <span className="rounded bg-yellow-200 px-1" {...rest} />;
                },
              }}
            >
              {currentText}
            </Markdown>
          </div>
        </div>
      </div>
    </div>
  );
}
