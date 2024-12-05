import { Outlet } from '@remix-run/react';
import { type MetaFunction } from '@vercel/remix';

import { Separator } from '../components/ui/separator';

export const meta: MetaFunction = () => {
  return [{ title: 'Dashboard' }];
};

export default function DashboardLayout() {
  return (
    <div className="flex h-auto min-h-screen flex-col gap-4 bg-secondary px-4">
      <div className="h-2"></div>
      <div className="text-2xl font-semibold">Dashboard</div>
      <Separator className="bg-yellow-600" />
      <Outlet />
    </div>
  );
}
