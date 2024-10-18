import { createUserSchema } from '~/validations/user.validation';
import { useState } from 'react';
import { langEnum, roleEnum, type ReadTeam } from '../../drizzle/schema';
import { createTeamSchema } from '../validations/team.validation';
import { FormInput, FormModal, FormSelect } from './FormModal';
import { Icons } from './icons';
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui';

export default function AdminActionButtons({ teams }: { teams: ReadTeam[] }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };
  const addTeamModal = (
    <FormModal
      kind="team"
      title="Create New Team"
      trigger={
        <Button
          variant="outline"
          size="icon"
          className="h-12 w-12 rounded-full shadow-lg transition-all duration-300 ease-in-out"
        >
          <Icons.Users className="h-4 w-4" />
        </Button>
      }
      schema={createTeamSchema}
    >
      <AddTeamForm />
    </FormModal>
  );

  const addUserModal = (
    <FormModal
      title="Create New User"
      kind="user"
      trigger={
        <Button
          variant="outline"
          size="icon"
          className="h-12 w-12 rounded-full shadow-lg transition-all duration-300 ease-in-out"
        >
          <Icons.User className="h-4 w-4" />
        </Button>
      }
      schema={createUserSchema}
    >
      <AddUserForm teams={teams} />
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
            aria-label={isExpanded ? 'Collapse actions' : 'Expand actions'}
            className="h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90"
            title={isExpanded ? 'Collapse actions' : 'Expand actions'}
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
    <div className="grid grid-cols-2 gap-4">
      <FormInput name="name" label="Team Name" required description="The name of the team." />
      <FormInput name="alias" label="Team Alias" required description="The alias of the team." />
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
    <div className="grid grid-cols-2 gap-4">
      <FormInput name="username" label="User Name" required description="The name of the user." />
      <FormInput name="email" label="Email" required description="The email of the user." />
      <FormSelect name="teamId" label="Team" required description="The team of the user." options={teamOptions} />
      <FormSelect name="role" label="Role" required description="The role of the user." options={rolesOptions} />
      <FormSelect
        name="originLang"
        label="Source Language"
        required
        description="The source language of the user."
        options={languageOptions}
      />
      <FormSelect
        name="targetLang"
        label="Target Language"
        required
        description="The target language of the user."
        options={languageOptions}
      />
      <FormInput name="password" label="Password" required description="The password of the user." />
    </div>
  );
};
