import { Outlet, useLoaderData } from '@remix-run/react';
import { useLocalStorage } from '@uidotdev/usehooks';
import { json, type LoaderFunctionArgs } from '@vercel/remix';
import { useEffect, useMemo } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { type ReadUser } from '../../drizzle/schema';
import { assertAuthUser } from '../auth.server';
import { AbilityContext, defineAbilityFor } from '../authorisation';
import { SearchProvider } from '../components/SearchContext';
import { SideBarMenu } from '../components/SideBarMenu';
import { readUsers } from '../services/user.service';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  const allUsers = await readUsers();

  const avatar = allUsers.find((u) => u.id === user?.id)?.avatar;
  const users = allUsers.map((u) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
  }));

  return json({ user, users, avatar });
};

export default function AppLayout() {
  const { user, users, avatar } = useLoaderData<typeof loader>();
  const allUsers = useMemo(() => {
    return users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role,
    }));
  }, [users]);

  if (!user) {
    return <Outlet />;
  }

  const ability = defineAbilityFor(user as unknown as ReadUser);

  return (
    <AbilityContext.Provider value={ability}>
      <SearchProvider allUsers={allUsers}>
        <div className="flex h-screen">
          <SideBarMenu userName={user.username} userEmail={user.email} userRole={user.role} avatarSrc={avatar} />
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
  const fontSize = useLocalStorage<number>('fontPreference', 14);

  useEffect(() => {
    document.documentElement.style.setProperty('--font-size', `${fontSize[0]}px`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};
