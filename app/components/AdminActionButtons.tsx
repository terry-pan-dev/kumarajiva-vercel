import { useState } from 'react';
import { useFormContext } from 'react-hook-form';

import { type ReadTeam } from '~/drizzle/tables';
import { langEnum, roleEnum } from '~/drizzle/tables/enums';
import { type ReadUser } from '~/drizzle/tables/user';
import { createTeamSchema } from '~/validations/team.validation';
import { createUserSchema, resetPasswordSchema } from '~/validations/user.validation';

import { FormInput, FormModal, FormSelect } from './FormModal';
import { Icons } from './icons';
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui';

export default function AdminActionButtons({ users, teams }: { users: ReadUser[]; teams: ReadTeam[] }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };
  const addTeamModal = (
    <FormModal
      kind="team"
      title="Create New Team"
      schema={createTeamSchema}
      trigger={
        <Button
          size="icon"
          variant="outline"
          className="h-12 w-12 rounded-full shadow-lg transition-all duration-300 ease-in-out"
        >
          <Icons.Users className="h-4 w-4" />
        </Button>
      }
    >
      <AddTeamForm />
    </FormModal>
  );

  const addUserModal = (
    <FormModal
      kind="user"
      title="Create New User"
      schema={createUserSchema}
      trigger={
        <Button
          size="icon"
          variant="outline"
          className="h-12 w-12 rounded-full shadow-lg transition-all duration-300 ease-in-out"
        >
          <Icons.User className="h-4 w-4" />
        </Button>
      }
    >
      <AddUserForm teams={teams} />
    </FormModal>
  );

  const resetPasswordModal = (
    <FormModal
      kind="reset-password"
      title="Reset User Password"
      schema={resetPasswordSchema}
      trigger={
        <Button
          size="icon"
          variant="outline"
          className="h-12 w-12 rounded-full shadow-lg transition-all duration-300 ease-in-out"
        >
          <Icons.Key className="h-4 w-4" />
        </Button>
      }
    >
      <ResetPasswordForm users={users} />
    </FormModal>
  );

  return (
    <TooltipProvider>
      <div className="fixed bottom-6 right-6">
        <div className="relative">
          {isExpanded && (
            <div className="absolute bottom-16 right-0 flex flex-col-reverse items-center gap-3">
              {[
                { modal: addTeamModal, tooltip: 'Add Team' },
                { modal: addUserModal, tooltip: 'Add User' },
                { modal: resetPasswordModal, tooltip: 'Reset Password' },
              ].map(({ modal, tooltip }, index) => (
                <Tooltip key={index}>
                  <TooltipTrigger asChild>
                    <div>
                      {modal}
                      <span className="sr-only">{tooltip}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p>{tooltip}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}
          <Button
            size="icon"
            onClick={toggleExpand}
            aria-expanded={isExpanded}
            title={isExpanded ? 'Collapse actions' : 'Expand actions'}
            aria-label={isExpanded ? 'Collapse actions' : 'Expand actions'}
            className="h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90"
          >
            <Icons.Editing className={`h-5 w-5 transition-transform duration-300 ${isExpanded ? 'rotate-45' : ''}`} />
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}

const AddTeamForm = () => {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <FormInput required name="name" label="Team Name" description="The name of the team." />
      <FormInput required name="alias" label="Team Alias" description="The alias of the team." />
    </div>
  );
};

const AddUserForm = ({ teams }: { teams: ReadTeam[] }) => {
  const teamOptions = teams.map((team) => ({
    label: team.alias ?? team.name,
    value: team.id,
  }));
  const rolesOptions = roleEnum.enumValues.map((role) => ({
    label: role,
    value: role,
  }));
  const languageOptions = langEnum.enumValues.map((language) => ({
    label: language,
    value: language,
  }));

  return (
    <div className="grid grid-cols-1 gap-1 lg:grid-cols-2 lg:gap-4">
      <FormInput required name="username" label="User Name" description="The name of the user." />
      <FormInput required name="email" label="Email" description="The email of the user." />
      <FormSelect required label="Team" name="teamId" options={teamOptions} description="The team of the user." />
      <FormSelect required name="role" label="Role" options={rolesOptions} description="The role of the user." />
      <FormSelect
        required
        name="originLang"
        label="Source Language"
        options={languageOptions}
        description="The source language of the user."
      />
      <FormSelect
        required
        name="targetLang"
        label="Target Language"
        options={languageOptions}
        description="The target language of the user."
      />
      <FormInput required name="password" label="Password" description="The password of the user." />
    </div>
  );
};

const ResetPasswordForm = ({ users }: { users: ReadUser[] }) => {
  const { watch } = useFormContext();
  const selectedUserId = watch('userId');
  const selectedUser = users.find((user) => user.id === selectedUserId);

  const userOptions = users.map((user) => ({
    label: user.username,
    value: user.id,
  }));

  return (
    <div className="grid grid-cols-1 gap-4">
      <FormSelect
        required
        label="User"
        name="userId"
        options={userOptions}
        description="Select the user to reset password."
      />
      {selectedUser && (
        <div className="rounded-md border p-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold">Email:</span> {selectedUser.email}
          </p>
        </div>
      )}
      <FormInput
        required
        type="password"
        name="password"
        label="New Password"
        description="Enter the new password for this user."
      />
    </div>
  );
};
