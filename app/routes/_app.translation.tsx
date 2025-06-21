import { Outlet, useLoaderData, useParams, type MetaFunction, useFetcher } from '@remix-run/react';
import { type ActionFunctionArgs, json, redirect, type LoaderFunctionArgs } from '@vercel/remix';
import { useEffect, useState } from 'react';

import { type ReadRollWithSutra } from '../../drizzle/tables';
import { assertAuthUser } from '../auth.server';
import { Can } from '../authorisation/can';
import { BreadcrumbLine } from '../components/Breadcrumb';
import { Icons } from '../components/icons';
import { SideBarTrigger } from '../components/SideBarTrigger';
import { Button } from '../components/ui/button';
import {
  DropdownMenuItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Separator } from '../components/ui/separator';
import { Toaster } from '../components/ui/toaster';
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
    users: allUsers.map((user) => ({ id: user.id, username: user.username, email: user.email, avatar: user.avatar })),
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
  const [portionDownloadMode, setPortionDownloadMode] = useState(false);
  const [selectedParagraphIds, setSelectedParagraphIds] = useState<string[]>([]);
  const [triggerPortionDownload, setTriggerPortionDownload] = useState(false);

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
    <div className="flex h-full w-full flex-col bg-secondary px-2 lg:px-4">
      <div className="my-2 flex h-10 w-full items-center justify-between gap-8 text-xl font-semibold">
        <div className="flex h-10 items-center gap-2">
          <SideBarTrigger />
          Tripitaka
        </div>
        <div className="flex w-full items-center justify-between">
          {/* <SideBarTrigger /> */}
          <BreadcrumbLine />
          {params.rollId ? (
            <Can I="Download" this="Paragraph">
              <DownloadButton
                loading={fetcher.state !== 'idle'}
                handleFullDownload={handleDownload}
                portionDownloadMode={portionDownloadMode}
                selectedCount={selectedParagraphIds.length}
                setPortionDownloadMode={setPortionDownloadMode}
                onResetSelection={() => setSelectedParagraphIds([])}
                onTriggerDownload={() => setTriggerPortionDownload(true)}
              />
            </Can>
          ) : null}
        </div>
      </div>
      <Separator className="mb-2 bg-yellow-600" />
      <Outlet
        context={{
          user,
          users,
          portionDownloadMode,
          selectedParagraphIds,
          setSelectedParagraphIds,
          triggerPortionDownload,
          setTriggerPortionDownload,
          setPortionDownloadMode,
        }}
      />
      <Toaster />
    </div>
  );
}

const DownloadButton = ({
  handleFullDownload,
  loading,
  portionDownloadMode,
  setPortionDownloadMode,
  selectedCount,
  onResetSelection,
  onTriggerDownload,
}: {
  handleFullDownload: () => void;
  loading: boolean;
  portionDownloadMode: boolean;
  setPortionDownloadMode: (mode: boolean) => void;
  selectedCount: number;
  onResetSelection: () => void;
  onTriggerDownload: () => void;
}) => {
  if (portionDownloadMode && selectedCount > 0) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-600">{selectedCount} selected</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            onResetSelection();
            setPortionDownloadMode(false);
          }}
        >
          Cancel
        </Button>
        <Button size="sm" className="bg-primary" onClick={onTriggerDownload}>
          <Icons.Download className="mr-1 h-4 w-4" />
          Download Selected
        </Button>
      </div>
    );
  }

  if (portionDownloadMode) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-600">Select paragraphs to download</span>
        <Button size="sm" variant="outline" onClick={() => setPortionDownloadMode(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Icons.Download className="h-6 w-6 text-slate-800" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right">
        <DropdownMenuItem>
          <button disabled={loading} onClick={handleFullDownload}>
            Full Download
          </button>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <button onClick={() => setPortionDownloadMode(true)}>Portion Download</button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
