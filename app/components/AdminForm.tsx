import { zodResolver } from '@hookform/resolvers/zod';
import { useFetcher } from '@remix-run/react';
import { useCallback, useEffect } from 'react';
import { Controller, FormProvider, useForm } from 'react-hook-form';
import { type ZodSchema } from 'zod';

import { type ReadTeam, type ReadUser } from '~/drizzle/tables';
import { langEnum, roleEnum } from '~/drizzle/tables/enums';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui';
import { useToast } from '../hooks/use-toast';
import { type UpdateUserSchema } from '../validations/user.validation';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface AdminFormProps<T extends ZodSchema> {
  teams: Omit<ReadTeam, 'createdAt' | 'updatedAt' | 'deletedAt'>[];
  user: Omit<ReadUser, 'createdAt' | 'updatedAt' | 'deletedAt' | 'linkValidUntil'>;
  userSchema: T;
}

export const AdminForm = <T extends ZodSchema>({ teams, user, userSchema }: AdminFormProps<T>) => {
  const fetcher = useFetcher<{
    success: boolean;
    errors: Record<string, string>;
  }>();
  const roles = roleEnum.enumValues;
  const languages = langEnum.enumValues;
  const form = useForm<UpdateUserSchema>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      id: user.id,
      teamId: teams.find((team) => team.id === user.teamId)?.id || '',
      originLang: user.originLang || '',
      targetLang: user.targetLang || '',
      role: user.role || '',
      email: user.email || '',
      username: user.username || '',
    },
  });
  const {
    formState: { dirtyFields },
  } = form;

  const onSubmit = useCallback(
    () => {
      if (Object.keys(dirtyFields).length) {
        const data = Object.keys(dirtyFields).reduce<Record<string, any>>(
          (acc, key) => {
            acc[key] = form.getValues(key as keyof UpdateUserSchema);
            return acc;
          },
          { id: user.id, kind: 'user' },
        );

        fetcher.submit(data, {
          method: 'POST',
        });
        return;
      }
      return;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dirtyFields, user.id],
  );

  const { toast } = useToast();
  useEffect(() => {
    if (!fetcher.data?.success) {
      console.log(fetcher.data);
    } else {
      toast({
        variant: 'default',
        title: 'User updated',
        position: 'top-right',
        description: 'User updated successfully',
      });
    }
  }, [fetcher.data, toast]);

  return (
    <FormProvider {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid grid-cols-2 gap-4 bg-white p-4">
          <input type="hidden" {...form.register('id')} value={user.id} />
          <div className="space-y-2">
            <label htmlFor={`username`} className="text-sm font-medium">
              User name:
            </label>
            <Input id="username" {...form.register('username')} />
            {form.formState.errors.username && (
              <p className="text-sm text-red-500">{form.formState.errors.username.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <label htmlFor={`email-${user.id}`} className="text-sm font-medium">
              Email:
            </label>
            <Input id="email" {...form.register('email')} />
            {form.formState.errors.email && (
              <p className="text-sm text-red-500">{form.formState.errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <label htmlFor={`team`} className="text-sm font-medium">
              Team:
            </label>
            <Controller
              name="teamId"
              control={form.control}
              render={({ field }) => (
                <Select defaultValue={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="team">
                    <SelectValue placeholder="Select team" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.alias ?? team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {form.formState.errors.teamId && (
              <p className="text-sm text-red-500">{form.formState.errors.teamId.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <label htmlFor={`role`} className="text-sm font-medium">
              Role:
            </label>
            <Controller
              name="role"
              control={form.control}
              render={({ field }) => (
                <Select defaultValue={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {form.formState.errors.role && <p className="text-sm text-red-500">{form.formState.errors.role.message}</p>}
          </div>
          <div className="space-y-2">
            <label htmlFor={`originLang`} className="text-sm font-medium">
              Source Language:
            </label>
            <Controller
              name="originLang"
              control={form.control}
              render={({ field }) => (
                <Select defaultValue={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="originLang">
                    <SelectValue placeholder="Select source language" {...form.register('originLang')} />
                  </SelectTrigger>
                  <SelectContent>
                    {languages.map((lang) => (
                      <SelectItem key={lang} value={lang}>
                        {lang.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {form.formState.errors.originLang && (
              <p className="text-sm text-red-500">{form.formState.errors.originLang.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <label htmlFor={`targetLang`} className="text-sm font-medium">
              Target Language:
            </label>
            <Controller
              name="targetLang"
              control={form.control}
              render={({ field }) => (
                <Select defaultValue={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="targetLang">
                    <SelectValue placeholder="Select target language" {...form.register('targetLang')} />
                  </SelectTrigger>
                  <SelectContent>
                    {languages.map((lang) => (
                      <SelectItem key={lang} value={lang}>
                        {lang.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {form.formState.errors.targetLang && (
              <p className="text-sm text-red-500">{form.formState.errors.targetLang.message}</p>
            )}
          </div>
          <div />
          <div className="flex justify-end">
            <Button type="submit" disabled={fetcher.state !== 'idle'}>
              Update
            </Button>
          </div>
        </div>
      </form>
    </FormProvider>
  );
};
