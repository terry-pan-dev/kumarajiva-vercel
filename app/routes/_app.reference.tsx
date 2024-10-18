import { Outlet } from '@remix-run/react';
import { type MetaFunction } from '@vercel/remix';
import { Separator } from '../components/ui/separator';

export const meta: MetaFunction = () => {
  return [{ title: 'Reference' }];
};

export default function ReferenceLayout() {
  return (
    <div className="flex h-screen flex-col gap-4 bg-secondary px-4">
      <div className="h-2"></div>
      <div className="text-2xl font-semibold">Reference</div>
      <Separator className="bg-yellow-600" />
      <Outlet />
    </div>
  );
}
