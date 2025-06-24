import { useLoaderData, useRouteError } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import bcrypt from 'bcryptjs';
import { useMemo, useState } from 'react';
import { ZodError } from 'zod';

import { assertAuthUser } from '../auth.server';
import { ErrorInfo } from '../components/ErrorInfo';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { UploadTab } from '../components/UploadTab';
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
  const [uploadResults, setUploadResults] = useState<Record<string, any>[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

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

  // Format upload results for GlossaryList component
  const formattedUploadResults = useMemo(() => {
    return uploadResults.map((result, index) => ({
      ...result,
      id: result.id || `temp-${index}`,
      createdBy: result.createdBy || 'upload-user',
      updatedBy: result.updatedBy || 'upload-user',
      searchId: result.searchId || null,
      createdAt: result.createdAt ? new Date(result.createdAt) : new Date(),
      updatedAt: result.updatedAt ? new Date(result.updatedAt) : new Date(),
      deletedAt: result.deletedAt ? new Date(result.deletedAt) : null,
      discussion: result.discussion || null,
      glossary: result.glossary || '',
      phonetic: result.phonetic || null,
      english: result.english || null,
      phoneticSearchable: result.phoneticSearchable || null,
      englishGlossarySearchable: result.englishGlossarySearchable || null,
      translations: result.translations || null,
      subscribers: result.subscribers || null,
      author: result.author || null,
      cbetaFrequency: result.cbetaFrequency || null,
    }));
  }, [uploadResults]);

  // Pagination for upload results
  const totalPages = Math.ceil(uploadResults.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedResults = formattedUploadResults.slice(startIndex, startIndex + itemsPerPage);

  const handleGlossaryUpload = (results: Record<string, any>[]) => {
    setUploadResults(results);
    setCurrentPage(1); // Reset to first page when new data is uploaded
  };

  const handleUploadResults = () => {
    // TODO: Implement actual upload functionality
    console.log('Uploading results:', uploadResults);
    // For now, just show a placeholder action
    alert(`Ready to upload ${uploadResults.length} glossary entries to the database.`);
  };

  return (
    <Tabs className="w-full" defaultValue="user-management">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="user-management">Users</TabsTrigger>
        <TabsTrigger value="system-notifications">Notifications</TabsTrigger>
        <TabsTrigger value="upload">Upload</TabsTrigger>
      </TabsList>
      <TabsContent value="user-management">
        <div className="overflow-y-auto">
          <AdminManagement users={cleanedUsers} teams={cleanedTeams} />
        </div>
      </TabsContent>
      <TabsContent value="system-notifications">
        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto">
          <SystemNotification banners={cleanedNotifications} />
        </div>
      </TabsContent>
      <TabsContent value="upload">
        <UploadTab
          totalPages={totalPages}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          uploadResults={uploadResults}
          paginatedResults={paginatedResults}
          onUploadResults={handleUploadResults}
          onGlossaryUpload={handleGlossaryUpload}
        />
      </TabsContent>
    </Tabs>
  );
}
