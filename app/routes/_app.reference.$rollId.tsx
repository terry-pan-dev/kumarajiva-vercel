import { useFetcher, useLoaderData } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
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
        <Paragraph text={paragraph.content} key={paragraph.id} isOrigin />
        <div className="h-2" />
        <div className="flex flex-col justify-between gap-2 lg:flex-row">
          {paragraph.references.map((reference) => (
            <div key={reference.id} className="w-full">
              <div className="overflow-hidden rounded-lg border border-gray-200 shadow-sm">
                <ReferenceForm referenceId={reference.id} content={reference.content} sutraName={reference.sutraName} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  });
  return <div className="flex flex-col gap-4">{Paragraphs}</div>;
}

function ReferenceForm({
  referenceId,
  content,
  sutraName,
}: {
  referenceId: string;
  content: string;
  sutraName: string;
}) {
  // const navigation = useNavigation();
  const fetcher = useFetcher<{ success: boolean }>();
  const isSubmitting = fetcher.state === 'submitting';
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const [text, setText] = useState<string>(content);
  useEffect(() => {
    if (textAreaRef.current) {
      textAreaRef.current.style.height = '0px';
      const scrollHeight = textAreaRef.current.scrollHeight + 10;

      textAreaRef.current.style.height = scrollHeight + 'px';
    }
  }, [textAreaRef, text]);

  return (
    <fetcher.Form method="post">
      <h5 className="bg-primary p-2 text-white">
        {sutraName}
        {fetcher.data?.success && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 1, ease: 'easeInOut' }}
            className="ml-2 text-sm text-green-400"
          >
            Updated
          </motion.span>
        )}
      </h5>
      <input type="hidden" name="referenceId" value={referenceId} />
      <textarea
        disabled={isSubmitting}
        id="OrderNotes"
        className="w-full resize-none border-none p-2 align-top sm:text-sm"
        rows={4}
        name="content"
        placeholder={'Input Reference Here'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        ref={textAreaRef}
      ></textarea>
      <div className="flex items-center justify-end gap-2 bg-white p-3">
        <button
          type="button"
          className="rounded bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-300/80"
          disabled={isSubmitting}
          onClick={() => setText('')}
        >
          Clear
        </button>
        <button
          type="submit"
          className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/80"
          disabled={isSubmitting}
        >
          Update
        </button>
      </div>
    </fetcher.Form>
  );
}
