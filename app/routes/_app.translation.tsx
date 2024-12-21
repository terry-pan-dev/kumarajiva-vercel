import { Outlet, useLoaderData, useParams, type MetaFunction } from '@remix-run/react';
import { json, redirect, type LoaderFunctionArgs } from '@vercel/remix';

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
  let paragraphs: IParagraph[] = [];
  let rollInfo: ReadRollWithSutra | undefined = undefined;
  if (params.rollId) {
    [paragraphs, rollInfo] = await Promise.all([
      readParagraphsByRollId({ rollId: params.rollId, user }),
      readRollById(params.rollId),
    ]);
  }
  return json({
    user,
    users: allUsers.map((user) => ({ id: user.id, username: user.username, email: user.email })),
    paragraphs,
    rollInfo,
  });
};

export default function TranslationLayout() {
  const { user, users, paragraphs, rollInfo } = useLoaderData<typeof loader>();
  const params = useParams();
  const { downloadDocx } = useDownloadDocx();
  console.log({ rollId: params.rollId, rollInfo });
  return (
    <div className="flex h-full flex-col gap-2 bg-secondary px-4">
      <div className="mt-2 text-xl font-semibold">Tripitaka</div>
      <div className="flex items-center justify-between">
        <BreadcrumbLine />
        {params.rollId && rollInfo ? (
          <Button size="icon" variant="ghost" onClick={() => downloadDocx(paragraphs, rollInfo)}>
            <Icons.Download className="h-6 w-6 text-slate-800" />
          </Button>
        ) : null}
      </div>
      <Separator className="bg-yellow-600" />
      <Outlet context={{ user, users }} />
    </div>
  );
}
