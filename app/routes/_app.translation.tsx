import { Outlet, useLoaderData, useParams, type MetaFunction, useFetcher } from '@remix-run/react';
import { type ActionFunctionArgs, json, redirect, type LoaderFunctionArgs } from '@vercel/remix';
import { useEffect, useState } from 'react';

import { assertAuthUser } from '~/auth.server';
import { Can } from '~/authorisation/can';
import { BreadcrumbLine } from '~/components/Breadcrumb';
import { Icons } from '~/components/icons';
import { SideBarTrigger } from '~/components/SideBarTrigger';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import { Toaster } from '~/components/ui/toaster';
import { useDownloadDocx } from '~/lib/hooks';
import { readUsers } from '~/services';
import { resolveSectionContext } from '~/services/project.service';
import { readParagraphsBySectionId, type IParagraphNew } from '~/services/text.service';

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
    users: allUsers.map((user) => ({ id: user.id, username: user.username, email: user.email, avatar: user.avatar })),
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  // The download is submitted from the editor page, which posts its own
  // project and section ids — this layout route has no params of its own.
  const formData = await request.formData();
  const projectId = formData.get('projectId');
  const sectionId = formData.get('sectionId');
  let paragraphs: IParagraphNew[] = [];
  let sectionInfo: { documentTitle: string; sectionTitle: string | null } | undefined = undefined;
  const context = projectId && sectionId ? await resolveSectionContext(projectId as string, sectionId as string) : null;
  if (context) {
    // Translations are paired from the project's target document by passage_key.
    paragraphs = await readParagraphsBySectionId({
      sectionId: context.origin.section.id,
      targetDocumentId: context.target.document.id,
    });
    sectionInfo = { documentTitle: context.origin.document.title, sectionTitle: context.origin.section.title };
  }
  return json({
    paragraphs,
    sectionInfo,
  });
};

export default function TranslationLayout() {
  const { user, users } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>({ key: 'download-docx' });
  const params = useParams();
  const { downloadDocx } = useDownloadDocx();
  const [isDownload, setIsDownload] = useState(false);

  useEffect(() => {
    if (fetcher.data && fetcher.data.paragraphs.length && fetcher.data.sectionInfo && isDownload) {
      downloadDocx(fetcher.data.paragraphs, fetcher.data.sectionInfo);
      setIsDownload(false);
    }
  }, [fetcher.data, isDownload, downloadDocx]);

  const handleDownload = async () => {
    fetcher.submit(
      {
        projectId: params.projectId || '',
        sectionId: params.sectionId || '',
      },
      {
        method: 'post',
      },
    );
    setIsDownload(true);
  };

  return (
    <div className="bg-secondary flex h-full w-full flex-col px-2 lg:px-4">
      <div className="my-2 flex h-10 w-full items-center justify-between gap-8 text-xl font-semibold">
        <div className="flex h-10 items-center gap-2">
          <SideBarTrigger />
          Tripitaka
        </div>
        <div className="flex w-full items-center justify-between">
          {/* <SideBarTrigger /> */}
          <BreadcrumbLine />
          {params.sectionId ? (
            <Can I="Maintain" this="TranslationData">
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={handleDownload}
                disabled={fetcher.state !== 'idle'}
              >
                <Icons.Download className="h-6 w-6 text-slate-800" />
              </Button>
            </Can>
          ) : null}
        </div>
      </div>
      <Separator className="mb-2 bg-yellow-600" />
      <div className="min-h-0 flex-1">
        <Outlet context={{ user, users }} />
      </div>
      <Toaster />
    </div>
  );
}
