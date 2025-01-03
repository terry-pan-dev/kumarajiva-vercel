import { Outlet, useRouteError } from '@remix-run/react';
import { type MetaFunction } from '@vercel/remix';

import { ErrorInfo } from '../components/ErrorInfo';
import { SideBarTrigger } from '../components/SideBarTrigger';
import { Separator } from '../components/ui/separator';

export const meta: MetaFunction = () => {
  return [{ title: 'Dashboard' }];
};

export function ErrorBoundary() {
  const error = useRouteError();

  return <ErrorInfo error={error} />;
}

export default function DashboardLayout() {
  return (
    <div className="flex h-auto min-h-screen flex-col bg-secondary px-4">
      <div className="my-2 flex h-10 items-center gap-2 text-xl font-semibold">
        <SideBarTrigger />
        Dashboard
      </div>
      <Separator className="mb-4 bg-yellow-600" />
      <Outlet />
    </div>
  );
}
