import { useLoaderData, useRouteError } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import bcrypt from 'bcryptjs';
import { useMemo } from 'react';
import { ZodError } from 'zod';

import { assertAuthUser } from '../auth.server';
import { ErrorInfo } from '../components/ErrorInfo';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { validatePayloadOrThrow } from '../lib/payload.validation';
import { SystemNotification } from '../pages/admin/system.notification';
import { AdminManagement } from '../pages/admin/user.management';
import {
  createNotification,
  deleteBanner,
  dismissNotification,
  readAllNotifications,
  toggleBanner,
} from '../services/notification.service';
import { createTeam, readTeams } from '../services/teams.service';
import { createUser, readUsers, updateUser } from '../services/user.service';
import { createBannerSchema } from '../validations/notification.validation';
import { createTeamSchema } from '../validations/team.validation';
import { createUserSchema, updateUserSchema } from '../validations/user.validation';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  const users = await readUsers();
  const teams = await readTeams();
  const notifications = await readAllNotifications();
  return json({
    users: users.filter((u) => u.id !== user.id || u.email === 'pantaotao123@gmail.com'),
    teams,
    user,
    notifications,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  const formData = await request.formData();
  const kind = formData.get('kind');
  const id = formData.get('id');

  if (!kind) {
    return json(
      {
        success: false,
        errors: [
          {
            path: ['kind'],
            message: 'Payload should have kind',
          },
        ],
      },
      { status: 400 },
    );
  }
  const data = Object.fromEntries(formData.entries());
  try {
    if (kind === 'user') {
      if (id) {
        const updateData = validatePayloadOrThrow({ schema: updateUserSchema, formData: data });
        console.debug('updateUser', updateData);
        await updateUser(updateData);
      } else {
        const result = validatePayloadOrThrow({ schema: createUserSchema, formData: data });
        const { password, ...newUser } = result;
        console.debug('newUser', newUser);
        const hashedPassword = await bcrypt.hash(password, 10);
        await createUser({
          ...newUser,
          password: hashedPassword,
          createdBy: user.id,
          updatedBy: user.id,
        });
      }
    } else if (kind === 'team') {
      const result = validatePayloadOrThrow({ schema: createTeamSchema, formData: data });
      const newTeam = {
        ...result,
        createdBy: user.id,
        updatedBy: user.id,
      };
      await createTeam(newTeam);
    } else if (kind === 'create-banner') {
      const result = validatePayloadOrThrow({ schema: createBannerSchema, formData: data });
      await createNotification({
        ...result,
        createdBy: user.id,
        updatedBy: user.id,
      });
    } else if (kind === 'dismiss-notification') {
      const notificationId = formData.get('notificationId') as string;
      await dismissNotification({ user: user, notificationId });
    } else if (kind === 'toggle-banner') {
      const bannerId = formData.get('bannerId') as string;
      await toggleBanner({ user: user, bannerId });
    } else if (kind === 'delete-banner') {
      const bannerId = formData.get('bannerId') as string;
      await deleteBanner({ user: user, bannerId });
    }
  } catch (error) {
    console.error('admin action error', error);
    if (error instanceof ZodError) {
      return json({ success: false, errors: { error: error.format() } });
    }
    return json({ success: false, errors: { error: 'Internal server error' } });
  }
  return json({ success: true });
};

export const ErrorBoundary = () => {
  const error = useRouteError();

  return <ErrorInfo error={error} />;
};

export default function AdminIndex() {
  const { users, teams, notifications } = useLoaderData<typeof loader>();
  const cleanedUsers = useMemo(
    () =>
      users.map((user) => ({
        ...user,
        createdAt: new Date(user.createdAt),
        updatedAt: new Date(user.updatedAt),
        deletedAt: user.deletedAt ? new Date(user.deletedAt) : null,
        linkValidUntil: user.linkValidUntil ? new Date(user.linkValidUntil) : null,
      })),
    [users],
  );

  const cleanedTeams = useMemo(
    () =>
      teams.map((team) => ({
        ...team,
        createdAt: new Date(team.createdAt),
        updatedAt: new Date(team.updatedAt),
        deletedAt: team.deletedAt ? new Date(team.deletedAt) : null,
      })),
    [teams],
  );

  const cleanedNotifications = useMemo(
    () =>
      notifications.map((notification) => ({
        ...notification,
        createdAt: new Date(notification.createdAt),
        updatedAt: new Date(notification.updatedAt),
        deletedAt: notification.deletedAt ? new Date(notification.deletedAt) : null,
      })),
    [notifications],
  );

  return (
    <Tabs className="w-full" defaultValue="user-management">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="user-management">Users</TabsTrigger>
        <TabsTrigger value="system-notifications">Notifications</TabsTrigger>
        <TabsTrigger value="upload">Upload</TabsTrigger>
      </TabsList>
      <TabsContent value="user-management" className="h-[calc(100vh-8rem)] overflow-y-auto">
        <AdminManagement users={cleanedUsers} teams={cleanedTeams} />
      </TabsContent>
      <TabsContent value="system-notifications" className="h-[calc(100vh-8rem)] overflow-y-auto">
        <SystemNotification banners={cleanedNotifications} />
      </TabsContent>
      <TabsContent value="upload" className="h-[calc(100vh-8rem)] overflow-y-auto">
        <div className="p-4">
          <p>Upload functionality will be implemented here.</p>
        </div>
      </TabsContent>
    </Tabs>
  );
}
