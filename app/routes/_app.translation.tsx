import { Outlet, useLoaderData, useParams, type MetaFunction, useFetcher } from '@remix-run/react';
import { type ActionFunctionArgs, json, redirect, type LoaderFunctionArgs } from '@vercel/remix';
import { useEffect, useState } from 'react';

import { type ReadRollWithSutra } from '../../drizzle/tables';
import { assertAuthUser } from '../auth.server';
import { BreadcrumbLine } from '../components/Breadcrumb';
import { Icons } from '../components/icons';
import { Button } from '../components/ui/button';
import { Separator } from '../components/ui/separator';
import { useDownloadDocx } from '../lib/hooks';
import { readUsers } from '../services';
import { type IParagraph, readParagraphsByRollId } from '../services/paragraph.service';
import { readRollById } from '../services/roll.service';

export const meta: MetaFunction = () => {
  return [{ title: 'Translation' }];
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  const allUsers = await readUsers();
  return json({
    user,
    users: allUsers.map((user) => ({ id: user.id, username: user.username, email: user.email })),
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  const formData = await request.formData();
  const rollId = formData.get('rollId');
  let paragraphs: IParagraph[] = [];
  let rollInfo: ReadRollWithSutra | undefined = undefined;
  if (rollId) {
    [paragraphs, rollInfo] = await Promise.all([
      readParagraphsByRollId({ rollId: rollId as string, user }),
      readRollById(rollId as string),
    ]);
  }
  console.log('downloading for rollId', rollId);
  return json({
    paragraphs,
    rollInfo,
  });
};

export default function TranslationLayout() {
  const { user, users } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>({ key: 'download-docx' });
  const params = useParams();
  const { downloadDocx } = useDownloadDocx();
  const [isDownload, setIsDownload] = useState(false);

  useEffect(() => {
    if (fetcher.data && fetcher.data.paragraphs.length && fetcher.data.rollInfo && isDownload) {
      downloadDocx(fetcher.data.paragraphs, fetcher.data.rollInfo);
      setIsDownload(false);
    }
  }, [fetcher.data, isDownload, downloadDocx]);

  const handleDownload = async () => {
    fetcher.submit(
      {
        rollId: params.rollId || '',
      },
      {
        method: 'post',
      },
    );
    setIsDownload(true);
  };

  return (
    <div className="flex h-full flex-col gap-2 bg-secondary px-4">
      <div className="mt-2 text-xl font-semibold">Tripitaka</div>
      <div className="flex items-center justify-between">
        <BreadcrumbLine />
        {params.rollId ? (
          <Button size="icon" variant="ghost" onClick={handleDownload} disabled={fetcher.state !== 'idle'}>
            <Icons.Download className="h-6 w-6 text-slate-800" />
          </Button>
        ) : null}
      </div>
      <Separator className="bg-yellow-600" />
      <Outlet context={{ user, users }} />
    </div>
  );
}
