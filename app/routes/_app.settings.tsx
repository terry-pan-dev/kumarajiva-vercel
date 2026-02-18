import { Outlet } from '@remix-run/react';
import { type MetaFunction } from '@vercel/remix';

import { SideBarTrigger } from '~/components/SideBarTrigger';
import { Separator } from '~/components/ui/separator';

export const meta: MetaFunction = () => {
  return [{ title: 'Setting' }];
};

export default function SettingLayout() {
  return (
    <div className="flex h-auto min-h-screen flex-col bg-secondary px-4">
      <div className="my-2 flex h-10 items-center gap-2 text-xl font-semibold">
        <SideBarTrigger />
        Settings
      </div>
      <Separator className="mb-2 bg-yellow-600" />
      <Outlet />
    </div>
  );
}
