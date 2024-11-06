import { Outlet, useLoaderData } from '@remix-run/react';
import { useLocalStorage } from '@uidotdev/usehooks';
import { json, type LoaderFunctionArgs } from '@vercel/remix';
import { useEffect } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { type ReadUser } from '../../drizzle/schema';
import { assertAuthUser } from '../auth.server';
import { AbilityContext, defineAbilityFor } from '../authorisation';
import { SearchProvider } from '../components/SearchContext';
import { SideBarMenu } from '../components/SideBarMenu';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  return json({ user });
};

export default function AppLayout() {
  const { user } = useLoaderData<typeof loader>();
  if (!user) {
    return <Outlet />;
  }

  const ability = defineAbilityFor(user as unknown as ReadUser);

  return (
    <AbilityContext.Provider value={ability}>
      <SearchProvider>
        <div className="flex h-screen">
          <SideBarMenu userName={user.username} userEmail={user.email} userRole={user.role} avatarSrc={user.avatar} />
          <main className="flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
        <ClientOnly>{() => <SettingLoader />}</ClientOnly>
      </SearchProvider>
    </AbilityContext.Provider>
  );
}

const SettingLoader = () => {
  const fontSize = useLocalStorage<number>('fontSize', 14);

  useEffect(() => {
    document.documentElement.style.setProperty('--font-size', `${fontSize[0]}px`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};
