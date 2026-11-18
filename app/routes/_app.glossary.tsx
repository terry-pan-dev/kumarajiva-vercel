import type { LoaderFunctionArgs, MetaFunction } from '@vercel/remix';

import { Outlet, useLoaderData } from '@remix-run/react';
import { json } from '@vercel/remix';
import { useState } from 'react';

import { assertAuthUser } from '~/auth.server';
import { SuggestTermDialog } from '~/components/glossary/SuggestTermDialog';
import { SideBarTrigger } from '~/components/SideBarTrigger';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import { Toaster } from '~/components/ui/toaster';
import { readUsers } from '~/services/user.service';

export const config = {
  memory: 3009,
};

export const meta: MetaFunction = () => {
  return [{ title: 'Glossary' }];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  const users = await readUsers();
  return json({ user, users: users.map((user) => ({ id: user.id, username: user.username, email: user.email })) });
};

export default function GlossaryLayout() {
  const { user, users } = useLoaderData<typeof loader>();
  return (
    <div className="bg-secondary flex h-auto min-h-screen flex-col px-2 lg:px-4">
      <div className="flex items-center justify-between">
        <div className="my-2 flex h-10 w-full items-center justify-between gap-2 text-xl font-semibold">
          <div className="flex items-center gap-2">
            <SideBarTrigger />
            Glossary
          </div>
          <div className="flex items-center gap-2">
            {/* Everyone suggests new terms the same way, whatever their role; entries are added
                directly only by import (Data Management). docs/plans/glossary-suggestions.md */}
            <SuggestTermButton />
          </div>
        </div>
      </div>
      <Separator className="mb-4 bg-yellow-600" />
      <Outlet context={{ user, users }} />
      <Toaster />
    </div>
  );
}

const SuggestTermButton = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="default" onClick={() => setOpen(true)}>
        Suggest a Term
      </Button>
      <SuggestTermDialog open={open} onOpenChange={setOpen} />
    </>
  );
};
