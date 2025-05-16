import { useFetcher, useLoaderData } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';

import type { ReadReference } from '../../drizzle/schema';

import { assertAuthUser } from '../auth.server';
import { Paragraph } from '../components/Paragraph';
import { readParagraphsAndReferencesByRollId } from '../services/paragraph.service';
import { updateReference } from '../services/reference.service';

export async function loader({ params }: LoaderFunctionArgs) {
  const { rollId } = params;
  const originalParagraphs = await readParagraphsAndReferencesByRollId(rollId as string);
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
  console.debug(referenceId, content);
  try {
    await updateReference({ id: referenceId as string, content: content as string, updatedBy: user.id });
    return json({ success: true });
  } catch (error) {
    console.log('reference update error', error);
    return json({ success: false });
  }
};

export default function ReferenceRoll() {
  const { paragraphs } = useLoaderData<typeof loader>();
  const Paragraphs = paragraphs.map((paragraph) => {
    return (
      <div key={paragraph.id}>
        <Paragraph isOrigin id={paragraph.id} key={paragraph.id} text={paragraph.content} />
        <div className="h-2" />
        <div className="flex flex-col justify-between gap-2">
          {paragraph.references.map((reference) => (
            <ReferenceWrapper key={reference.id} reference={reference} />
          ))}
        </div>
      </div>
    );
  });
  return <div className="flex flex-col gap-4">{Paragraphs}</div>;
}

function ReferenceWrapper({ reference }: { reference: Omit<ReadReference, 'createdAt' | 'updatedAt' | 'deletedAt'> }) {
  const [text, setText] = useState<string>(reference.content);
  const [history, setHistory] = useState<string[]>([reference.content]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

  const setReferenceText = useCallback(
    (newText: string) => {
      setText(newText);

      // Track unsaved changes
      setHasUnsavedChanges(newText !== reference.content);

      // Add to history if text changed
      if (newText !== text) {
        // Remove any forward history if we're not at the end
        const newHistory = history.slice(0, historyIndex + 1);
        // Add the new state to history
        newHistory.push(newText);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
      }
    },
    [text, history, historyIndex, reference.content],
  );

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const previousText = history[newIndex];
      setText(previousText);
      setHistoryIndex(newIndex);

      // Update unsaved changes status
      setHasUnsavedChanges(previousText !== reference.content);
    }
  }, [history, historyIndex, reference.content]);

  return (
    <div className="w-full" key={reference.id}>
      <div className="flex overflow-hidden rounded-lg border border-gray-200 shadow-sm">
        <ReferenceForm
          content={text}
          onUndo={handleUndo}
          referenceId={reference.id}
          canUndo={historyIndex > 0}
          sutraName={reference.sutraName}
          setReferenceText={setReferenceText}
          hasUnsavedChanges={hasUnsavedChanges}
          onUpdateSuccess={() => setHasUnsavedChanges(false)}
        />
        {/* Preview panel */}
        <div className="flex flex-1 flex-col border-l border-gray-200">
          <div className="bg-primary p-2 text-white">
            <h5>Preview: {reference.sutraName}</h5>
          </div>
          <div className="flex-1 overflow-auto p-2 align-top sm:text-sm">
            <Markdown
              components={{
                code(props) {
                  return <span className="rounded bg-yellow-200 px-1" {...props} />;
                },
              }}
            >
              {text}
            </Markdown>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReferenceForm({
  referenceId,
  content,
  sutraName,
  setReferenceText,
  onUndo,
  canUndo,
  hasUnsavedChanges,
  onUpdateSuccess,
}: {
  referenceId: string;
  content: string;
  sutraName: string;
  setReferenceText: (text: string) => void;
  onUndo: () => void;
  canUndo: boolean;
  hasUnsavedChanges: boolean;
  onUpdateSuccess: () => void;
}) {
  // const navigation = useNavigation();
  const fetcher = useFetcher<{ success: boolean }>();
  const isSubmitting = fetcher.state === 'submitting';
  const [isUpdated, setIsUpdated] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const [hasSelection, setHasSelection] = useState(false);

  // Set isUpdated when fetcher data changes
  useEffect(() => {
    if (fetcher.data?.success) {
      setIsUpdated(true);
      onUpdateSuccess();
    }
  }, [fetcher.data, onUpdateSuccess]);

  // Auto-resize textarea whenever content changes
  useEffect(() => {
    if (textAreaRef.current) {
      // Save the current cursor position
      const selectionStart = textAreaRef.current.selectionStart;
      const selectionEnd = textAreaRef.current.selectionEnd;

      // Reset height before calculating the new one
      textAreaRef.current.style.height = 'auto';
      textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`;

      // Restore the cursor position
      textAreaRef.current.setSelectionRange(selectionStart, selectionEnd);
    }
  }, [content]);

  const handleHighlight = () => {
    if (textAreaRef.current) {
      const start = textAreaRef.current.selectionStart;
      const end = textAreaRef.current.selectionEnd;

      if (start !== end) {
        const newText = content.substring(0, start) + `\`${content.substring(start, end)}\`` + content.substring(end);
        setReferenceText(newText);

        // Reset cursor position after adding tags
        setTimeout(() => {
          if (textAreaRef.current) {
            textAreaRef.current.focus();
            textAreaRef.current.setSelectionRange(
              start,
              start + (end - start) + 2, // 2 is the length of `` characters
            );
          }
        }, 1);
      }
    }
  };

  // Check for text selection
  const handleSelectionChange = () => {
    if (textAreaRef.current) {
      const start = textAreaRef.current.selectionStart;
      const end = textAreaRef.current.selectionEnd;
      setHasSelection(start !== end);
    }
  };

  // Handle content changes
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setReferenceText(e.target.value);
  };

  // Handle paste event specifically
  const handlePaste = () => {
    // Use setTimeout to let the paste operation complete
    setTimeout(() => {
      if (textAreaRef.current) {
        textAreaRef.current.style.height = 'auto';
        textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`;
      }
    }, 0);
  };

  return (
    <fetcher.Form method="post" className="flex flex-1 flex-col">
      <h5 className="bg-primary p-2 text-white">
        {sutraName}
        {isUpdated && (
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
      <input type="hidden" name="referenceId" value={referenceId} />
      <div className="relative flex-1">
        <textarea
          name="content"
          value={content}
          id="OrderNotes"
          ref={textAreaRef}
          onPaste={handlePaste}
          disabled={isSubmitting}
          style={{ height: 'auto' }}
          onChange={handleContentChange}
          onKeyUp={handleSelectionChange}
          onSelect={handleSelectionChange}
          onMouseUp={handleSelectionChange}
          placeholder={'Input Reference Here'}
          className="min-h-[80px] w-full resize-none overflow-hidden border-none p-2 align-top sm:text-sm"
        ></textarea>
      </div>
      <div className="flex items-center justify-end gap-2 bg-white p-3">
        <button
          type="button"
          onClick={handleHighlight}
          disabled={!hasSelection || isSubmitting || isUpdated}
          className={`rounded px-3 py-1.5 text-sm font-medium ${
            hasSelection && !isUpdated
              ? 'bg-yellow-400 text-white hover:bg-yellow-500'
              : 'cursor-not-allowed bg-gray-200 text-gray-500'
          }`}
        >
          Highlight
        </button>
        {canUndo && !isUpdated && (
          <button
            type="button"
            onClick={onUndo}
            disabled={isSubmitting}
            className="rounded bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600"
          >
            Undo
          </button>
        )}
        <button
          type="button"
          disabled={isSubmitting || isUpdated}
          onClick={() => setReferenceText('')}
          className="rounded bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-300/80"
        >
          Clear
        </button>
        <button
          type="submit"
          disabled={isSubmitting || isUpdated}
          className="relative rounded bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/80"
        >
          Update
          {hasUnsavedChanges && !isSubmitting && !isUpdated && (
            <div className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-red-500"></div>
          )}
        </button>
      </div>
    </fetcher.Form>
  );
}
