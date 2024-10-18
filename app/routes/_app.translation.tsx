import { Outlet, type MetaFunction } from '@remix-run/react';
import { BreadcrumbLine } from '../components/Breadcrumb';
import { Separator } from '../components/ui/separator';

export const meta: MetaFunction = () => {
  return [{ title: 'Translation' }];
};

export default function TranslationLayout() {
  return (
    <div className="flex h-full flex-col gap-2 bg-secondary px-4">
      <div className="mt-2 text-xl font-semibold">Tripitaka</div>
      <BreadcrumbLine />
      <Separator className="bg-yellow-600" />
      <Outlet />
    </div>
  );
}
