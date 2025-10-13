import { useCallback } from 'react';
import { match } from 'ts-pattern';

import AdminActionButtons from '~/components/AdminActionButtons';
import { AdminForm } from '~/components/AdminForm';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Badge } from '~/components/ui';
import { type UserRole } from '~/drizzle/tables/enums';
import { type ReadTeam } from '~/drizzle/tables/team';
import { type ReadUser } from '~/drizzle/tables/user';
import { updateUserSchema } from '~/validations/user.validation';

export const AdminManagement = ({ users, teams }: { users: ReadUser[]; teams: ReadTeam[] }) => {
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
      <AdminActionButtons users={users} teams={cleanedTeams} />
      <div className="mx-auto w-full lg:space-y-6 lg:p-6">
        <Accordion collapsible type="single" className="w-full">
          {users.map((user) => (
            <AccordionItem key={user.id} value={user.id}>
              <AccordionTrigger className="flex bg-primary px-2 py-2 text-md text-white lg:text-lg">
                <div className="flex items-center gap-2">
                  <span>{user.username}</span>
                  <Badge className={getBadgeVariant(user.role as UserRole)}>{user.role}</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <AdminForm user={user} teams={teams} userSchema={updateUserSchema} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
};
