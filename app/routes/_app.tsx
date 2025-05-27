import { Outlet, useFetcher, useLoaderData, useRouteError } from '@remix-run/react';
import { useLocalStorage } from '@uidotdev/usehooks';
import { json, redirect, type LoaderFunctionArgs } from '@vercel/remix';
import { useEffect, useMemo } from 'react';
import { ClientOnly } from 'remix-utils/client-only';

import { type ReadUser } from '../../drizzle/schema';
import { assertAuthUser } from '../auth.server';
import { AbilityContext, defineAbilityFor } from '../authorisation';
import { BannerStack } from '../components/BannerStack';
import { CommentProvider } from '../components/CommentContext';
import { ErrorInfo } from '../components/ErrorInfo';
import { SearchProvider } from '../components/SearchContext';
import { SideBarMenu } from '../components/SideBarMenu';
import { SideBarMenuContextProvider } from '../components/SideBarMenuContext';
import { readActiveNotifications } from '../services/notification.service';
import { readUsers } from '../services/user.service';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  const allUsers = await readUsers();

  const users = allUsers.map((u) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
  }));

  const notifications = await readActiveNotifications();
  const dismissedNotifications = notifications.filter((n) => !n.dismissedBy?.includes(user.id));

  return json({ user, users, avatar: user.avatar, notifications: dismissedNotifications });
};

export function ErrorBoundary() {
  const error = useRouteError();

  return <ErrorInfo error={error} />;
}

export default function AppLayout() {
  const { user, users, avatar, notifications } = useLoaderData<typeof loader>();
  const allUsers = useMemo(() => {
    return users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role,
    }));
  }, [users]);

  const fetcher = useFetcher();

  if (!user) {
    return <Outlet />;
  }

  const ability = defineAbilityFor(user as unknown as ReadUser);

  const handleDismiss = async (notificationId: string) => {
    fetcher.submit({ notificationId, kind: 'dismiss-notification' }, { method: 'POST', action: '/admin?index' });
  };

  return (
    <AbilityContext.Provider value={ability}>
      <SearchProvider allUsers={allUsers}>
        <CommentProvider>
          <SideBarMenuContextProvider>
            <BannerStack banners={notifications} onDismiss={handleDismiss} />
            <div className="flex h-screen">
              <SideBarMenu avatarSrc={avatar} userRole={user.role} userEmail={user.email} userName={user.username} />
              <main className="flex-1 overflow-y-auto bg-secondary">
                <Outlet />
              </main>
            </div>
          </SideBarMenuContextProvider>
          <ClientOnly>{() => <SettingLoader />}</ClientOnly>
        </CommentProvider>
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
