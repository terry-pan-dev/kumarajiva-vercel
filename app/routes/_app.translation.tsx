import { Outlet, useLoaderData, type MetaFunction } from '@remix-run/react';
import { json, type LoaderFunctionArgs } from '@vercel/remix';

import { assertAuthUser } from '../auth.server';
import { BreadcrumbLine } from '../components/Breadcrumb';
import { Separator } from '../components/ui/separator';

export const meta: MetaFunction = () => {
  return [{ title: 'Translation' }];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  return json({ user });
};

export default function TranslationLayout() {
  const { user } = useLoaderData<typeof loader>();
  return (
    <div className="flex h-full flex-col gap-2 bg-secondary px-4">
      <div className="mt-2 text-xl font-semibold">Tripitaka</div>
      <BreadcrumbLine />
      <Separator className="bg-yellow-600" />
      <Outlet context={{ user }} />
    </div>
  );
}
