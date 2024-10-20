import { useLoaderData, useRouteError } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { type UserRole } from '~/drizzle/tables/enums';
import bcrypt from 'bcryptjs';
import { useCallback } from 'react';
import { match } from 'ts-pattern';
import { ZodError } from 'zod';
import { assertAuthUser } from '../auth.server';
import AdminActionButtons from '../components/AdminActionButtons';
import { AdminForm } from '../components/AdminForm';
import { ErrorInfo } from '../components/ErrorInfo';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Badge } from '../components/ui';
import { validatePayloadOrThrow } from '../lib/payload.validation';
import { createTeam, readTeams } from '../services/teams.service';
import { createUser, readUsers, updateUser } from '../services/user.service';
import { createTeamSchema } from '../validations/team.validation';
import { createUserSchema, updateUserSchema } from '../validations/user.validation';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  const users = await readUsers();
  const teams = await readTeams();
  return json({ users: users.filter((u) => u.id !== user.id || u.email === 'pantaotao123@gmail.com'), teams, user });
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
  const { users, teams } = useLoaderData<typeof loader>();
  console.log('admin index', { users, teams });
  const getBadgeVariant = useCallback((role: UserRole) => {
    return match(role)
      .with('admin', () => 'bg-pink-500')
      .with('reader', () => 'bg-green-500')
      .with('manager', () => 'bg-blue-500')
      .with('leader', () => 'bg-yellow-500')
      .with('editor', () => 'bg-purple-500')
      .with('assistant', () => 'bg-orange-500')
      .exhaustive();
  }, []);

  const cleanedTeams = teams.map((team) => ({
    ...team,
    createdAt: new Date(team.createdAt),
    updatedAt: new Date(team.updatedAt),
    deletedAt: team.deletedAt ? new Date(team.deletedAt) : null,
  }));

  return (
    <div>
      <AdminActionButtons teams={cleanedTeams} />
      <div className="mx-auto w-full space-y-6 p-6">
        <Accordion type="single" collapsible className="w-full">
          {users.map((user) => (
            <AccordionItem key={user.id} value={user.id}>
              <AccordionTrigger className="flex bg-primary px-2 py-2 text-white">
                <div className="flex items-center gap-2">
                  <span>{user.username}</span>
                  <Badge className={getBadgeVariant(user.role as UserRole)}>{user.role}</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <AdminForm teams={teams} user={user} userSchema={updateUserSchema} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
}
