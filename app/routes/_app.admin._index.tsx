import { useLoaderData, useRouteError, useSubmit, useActionData } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import bcrypt from 'bcryptjs';
import { useMemo, useState, useEffect, useCallback } from 'react';
import { ZodError } from 'zod';

import type { ReadGlossary } from '~/drizzle/tables';

import resend from '~/providers/resend';

import { assertAuthUser } from '../auth.server';
import { ErrorInfo } from '../components/ErrorInfo';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { useToast } from '../hooks/use-toast';
import { validatePayloadOrThrow } from '../lib/payload.validation';
import { SystemNotification } from '../pages/admin/system.notification';
import { UploadManagement } from '../pages/admin/upload.management';
import { AdminManagement } from '../pages/admin/user.management';
import { bulkCreateGlossariesFromTransformed, type UploadReport } from '../services/glossary.service';
import {
  createNotification,
  deleteBanner,
  dismissNotification,
  readAllNotifications,
  toggleBanner,
} from '../services/notification.service';
import { bulkCreateParagraphs } from '../services/paragraph.service';
import { createRoll } from '../services/roll.service';
import { createSutra, getAllSutrasWithRolls } from '../services/sutra.service';
import { createTeam, readTeams } from '../services/teams.service';
import { createUser, readUsers, updateUser } from '../services/user.service';
import {
  transformUploadDataToGlossariesForFrontend,
  transformGlossariesToCreateFormat,
} from '../utils/glossary.transformation';
import { createBannerSchema } from '../validations/notification.validation';
import { bulkCreateParagraphsSchema } from '../validations/paragraph-upload.validation';
import { createRollSchema } from '../validations/roll.validation';
import { createSutraSchema } from '../validations/sutra.validation';
import { createTeamSchema } from '../validations/team.validation';
import { createUserSchema, updateUserSchema } from '../validations/user.validation';

// Type for upload results from CSV processing
interface UploadResultItem {
  id: string;
  glossary: string;
  phonetic?: string;
  phoneticSearchable?: string;
  author?: string;
  cbetaFrequency?: string;
  subscribers?: number;
  translations?: Array<{
    glossary: string;
    glossarySearchable?: string;
    language: string;
    sutraName?: string;
    volume?: string;
    author?: string;
    originSutraText?: string;
    targetSutraText?: string;
  }>;
  // Additional fields for display formatting
  english?: string;
  sutraName?: string;
  volume?: string;
  createdAt?: string;
  updatedAt?: string;
  discussion?: string;
  createdBy?: string;
  updatedBy?: string;
  searchId?: string | null;
  deletedAt?: Date | null;
  englishGlossarySearchable?: string | null;
}

type UploadResults = UploadResultItem[];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  const users = await readUsers();
  const teams = await readTeams();
  const notifications = await readAllNotifications();
  // Admins can see all sutras regardless of team
  const sutras = await getAllSutrasWithRolls();
  return json({
    users: users.filter((u) => u.id !== user.id || u.email === 'pantaotao123@gmail.com'),
    teams,
    user,
    notifications,
    sutras,
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
        await resend.emails.send({
          from: 'Kumarajiva <onboarding@info.btts-kumarajiva.org>',
          to: newUser.email,
          subject: 'Welcome to Kumarajiva',
          html: `<p>Welcome to Kumarajiva! You can login with your email and initial password.</p>
          <p>Site: <a href="https://btts-kumarajiva.org">https://btts-kumarajiva.org</a></p>
          <p>Email: ${newUser.email}</p>
          <p>Password: ${password}</p>
          <p>Please change your password after login.</p>
          <p>Thank you for using Kumarajiva!</p>`,
        });
        console.log(`email sent to ${newUser.email}`);
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
    } else if (kind === 'upload-glossaries-transformed') {
      const glossariesJson = formData.get('glossaries') as string;

      if (!glossariesJson) {
        return json(
          {
            success: false,
            errors: [
              {
                path: ['glossaries'],
                message: 'Glossaries data is required',
              },
            ],
          },
          { status: 400 },
        );
      }

      let glossariesData;
      try {
        glossariesData = JSON.parse(glossariesJson);
      } catch (parseError) {
        return json(
          {
            success: false,
            errors: [
              {
                path: ['glossaries'],
                message: 'Invalid JSON format for glossaries data',
              },
            ],
          },
          { status: 400 },
        );
      }

      console.log('Processing transformed glossaries:', glossariesData.slice(0, 2));
      console.log(`Processing ${glossariesData.length} glossary entries`);

      // Process bulk upload to database and Algolia using the new optimized method
      const uploadResult = await bulkCreateGlossariesFromTransformed(glossariesData);

      // Always return the upload report, even if there are some failures
      return json({
        success: true,
        uploadReport: uploadResult,
      });
    } else if (kind === 'upload-paragraph') {
      const uploadResultsJson = formData.get('uploadResults') as string;

      if (!uploadResultsJson) {
        return json(
          {
            success: false,
            errors: [
              {
                path: ['uploadResults'],
                message: 'Upload results are required',
              },
            ],
          },
          { status: 400 },
        );
      }

      let uploadResultsData;
      try {
        uploadResultsData = JSON.parse(uploadResultsJson);
      } catch (parseError) {
        return json(
          {
            success: false,
            errors: [
              {
                path: ['uploadResults'],
                message: 'Invalid JSON format for upload results',
              },
            ],
          },
          { status: 400 },
        );
      }

      const result = validatePayloadOrThrow({
        schema: bulkCreateParagraphsSchema,
        formData: uploadResultsData[0],
      });

      console.log('Validated paragraph upload:', result.data[0]);
      console.log(`Processing ${result.data.length} paragraph entries for user ${user.id}`);

      // Process bulk upload to database and Algolia
      const uploadResult = await bulkCreateParagraphs({
        ...result,
        createdBy: user.id,
      });

      console.log(`Successfully processed ${uploadResult.length} paragraph entries.`);
      return json({
        success: true,
        message: `Successfully uploaded ${uploadResult.length} paragraphs`,
      });
    } else if (kind === 'create-sutra') {
      const result = validatePayloadOrThrow({ schema: createSutraSchema, formData: data });
      // Use the selected team ID from the form (now required)
      const createdSutras = await createSutra(result, result.teamId, user.id);
      const createdSutra = createdSutras[0];
      return json({
        success: true,
        sutraId: createdSutra?.id,
        message: 'Sutra created successfully',
      });
    } else if (kind === 'create-roll') {
      const result = validatePayloadOrThrow({ schema: createRollSchema, formData: data });
      const createdRolls = await createRoll(result, user.id);
      const createdRoll = createdRolls[0];
      return json({
        success: true,
        rollId: createdRoll?.id,
        message: 'Chapter created successfully',
      });
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
  const { users, teams, notifications, sutras, user } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const { toast } = useToast();
  const [transformedGlossaries, setTransformedGlossaries] = useState<ReadGlossary[]>([]);
  const [paragraphUploadResults, setParagraphUploadResults] = useState<any[]>([]);
  const [paragraphUploadMetadata, setParagraphUploadMetadata] = useState<{ sutraId: string; rollId: string } | null>(
    null,
  );
  const [uploadReport, setUploadReport] = useState<UploadReport | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isUploading, setIsUploading] = useState(false);
  const [currentSutras, setCurrentSutras] = useState(sutras);
  const itemsPerPage = 10;

  // Function to refresh sutras data
  const refreshSutrasData = useCallback(async () => {
    try {
      const response = await fetch('/api/sutras-with-rolls');
      if (response.ok) {
        const freshSutras = await response.json();
        setCurrentSutras(freshSutras);
      }
    } catch (error) {
      console.error('Failed to refresh sutras:', error);
    }
  }, []);

  // Update currentSutras when sutras prop changes (initial load)
  useEffect(() => {
    setCurrentSutras(sutras);
  }, [sutras]);

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

  const cleanedSutras = useMemo(
    () =>
      currentSutras.map((sutra) => ({
        ...sutra,
        createdAt: new Date(sutra.createdAt),
        updatedAt: new Date(sutra.updatedAt),
        deletedAt: sutra.deletedAt ? new Date(sutra.deletedAt) : null,
      })),
    [currentSutras],
  );

  // Pagination for transformed glossaries
  const totalPages = Math.ceil(transformedGlossaries.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedResults = transformedGlossaries.slice(startIndex, startIndex + itemsPerPage);

  const handleGlossaryUpload = (results: Record<string, unknown>[]) => {
    // Type assertion - we know the structure from the CSV processing
    const uploadData = results as unknown as UploadResults;

    // Transform the flat data to proper glossary structure for frontend display
    const transformed = transformUploadDataToGlossariesForFrontend(uploadData, user.id);
    setTransformedGlossaries(transformed);

    setCurrentPage(1); // Reset to first page when new data is uploaded
  };

  const handleParagraphUpload = (results: Record<string, unknown>[]) => {
    // Extract the paragraph data from the results
    const uploadData = results[0] as any;
    const paragraphData = uploadData.data || [];

    setParagraphUploadResults(paragraphData);
    setParagraphUploadMetadata({
      sutraId: uploadData.sutraId,
      rollId: uploadData.rollId,
    });
    setCurrentPage(1); // Reset to first page when new data is uploaded
  };

  // Handle action data and show toasts for errors only (success redirects server-side)
  useEffect(() => {
    if (actionData) {
      if ('success' in actionData && !actionData.success && 'errors' in actionData) {
        const errors = actionData.errors;
        let errorMessages: string;

        if (Array.isArray(errors)) {
          errorMessages = errors.map((error) => ('message' in error ? error.message : String(error))).join(', ');
        } else if (typeof errors === 'object' && errors !== null && 'error' in errors) {
          errorMessages = 'Validation errors occurred. Please check the console for details.';
        } else {
          errorMessages = 'An unknown error occurred';
        }

        toast({
          title: 'Upload Failed',
          description: errorMessages,
          variant: 'error',
        });
        setIsUploading(false);
      } else if ('success' in actionData && actionData.success) {
        if ('uploadReport' in actionData) {
          // Handle glossary upload report
          setUploadReport(actionData.uploadReport as UploadReport);
          setIsUploading(false);

          const report = actionData.uploadReport as UploadReport;
          toast({
            title: 'Upload Completed',
            description: `${report.totalInserted} glossaries uploaded successfully${report.totalFailed > 0 ? `, ${report.totalFailed} failed` : ''}`,
            variant: report.success ? 'default' : 'error',
          });
        } else if ('message' in actionData) {
          // Handle successful paragraph upload or roll creation
          toast({
            title: 'Upload Successful',
            description: String(actionData.message),
            variant: 'default',
          });
          setIsUploading(false);

          // Refresh sutras data if a roll was created
          if (String(actionData.message).includes('Chapter created successfully')) {
            refreshSutrasData();
          }
        }
      }
    }
  }, [actionData, toast, refreshSutrasData]);

  const handleUploadResults = () => {
    if (transformedGlossaries.length === 0 && paragraphUploadResults.length === 0) {
      toast({
        title: 'No Data to Upload',
        description: 'Please upload and process a CSV file first.',
        variant: 'error',
      });
      return;
    }

    setIsUploading(true);

    if (transformedGlossaries.length > 0) {
      // Handle glossary upload
      const glossariesForBackend = transformGlossariesToCreateFormat(transformedGlossaries);

      const formData = new FormData();
      formData.append('kind', 'upload-glossaries-transformed');
      formData.append('glossaries', JSON.stringify(glossariesForBackend));

      submit(formData, { method: 'post' });
    } else if (paragraphUploadResults.length > 0) {
      // Handle paragraph upload
      const formData = new FormData();
      formData.append('kind', 'upload-paragraph');
      formData.append(
        'uploadResults',
        JSON.stringify([
          {
            data: paragraphUploadResults,
            sutraId: paragraphUploadMetadata?.sutraId,
            rollId: paragraphUploadMetadata?.rollId,
          },
        ]),
      );

      submit(formData, { method: 'post' });
    }
  };

  const handleCancelUpload = () => {
    setTransformedGlossaries([]);
    setParagraphUploadResults([]);
    setParagraphUploadMetadata(null);
    setUploadReport(null);
    setCurrentPage(1);
    setIsUploading(false);
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
        <UploadManagement
          teams={cleanedTeams}
          sutras={cleanedSutras}
          totalPages={totalPages}
          currentPage={currentPage}
          isUploading={isUploading}
          uploadReport={uploadReport}
          onPageChange={setCurrentPage}
          onCancelUpload={handleCancelUpload}
          paginatedResults={paginatedResults}
          onUploadResults={handleUploadResults}
          uploadResults={transformedGlossaries}
          onGlossaryUpload={handleGlossaryUpload}
          onParagraphUpload={handleParagraphUpload}
          paragraphUploadResults={paragraphUploadResults}
        />
      </TabsContent>
    </Tabs>
  );
}
