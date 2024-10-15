import { zodResolver } from '@hookform/resolvers/zod';
import { useFetcher } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { assertAuthUser, authenticator } from '~/auth.server';
import { logger } from '~/lib/logger';
import { cn, emailRegex } from '~/lib/utils';
import { commitSession, getSession } from '~/session.server';
import React from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Icons } from '../components/icons';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { validatePayload } from '../lib/payload.validation';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log('login loader');
  return json({});
};

export async function action({ request }: ActionFunctionArgs) {
  try {
    const clonedRequest = request.clone();
    const formData = Object.fromEntries(await clonedRequest.formData());
    validatePayload({ schema: loginSchema, formData });

    const user = await authenticator.authenticate('credential', request);

    if (user) {
      const session = await getSession(request.headers.get('cookie'));
      session.set(authenticator.sessionKey, user);

      const headers = new Headers({ 'Set-Cookie': await commitSession(session) });
      if (user.firstLogin) {
        logger.info('login', 'first login user');
        return redirect(`/update_password?email=${user.email}`, { headers });
      }
      logger.info('login', 'redirect to root page');
      return redirect('/', { headers });
    } else {
      logger.info('login', 'wrong credentials');
      return json({ password: 'please enter correct credentials' }, { status: 401 });
    }
  } catch (error: unknown) {
    logger.error('login', 'message', (error as Error)?.message);
    logger.error('login', 'stack trace', (error as Error)?.stack);
    return json({ password: 'Internal Server Error' }, { status: 500 });
  }
}

export default function LoginForm() {
  const fetcher = useFetcher();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const { errors } = form.formState;
  const onSubmit = (data: z.infer<typeof loginSchema>) => {
    console.log(data);
    fetcher.submit(data, { method: 'post' });
  };

  return (
    <div className="mx-auto w-full max-w-md rounded-none bg-white p-4 shadow-input dark:bg-black md:rounded-2xl md:p-8">
      <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-200">Welcome to Kumarajiva</h2>
      <p className="mt-2 max-w-sm text-sm text-neutral-600 dark:text-neutral-300">
        Kumarajiva is a internal use tool. Login if you can, otherwise ask admin to invite you.
      </p>

      <FormProvider {...form}>
        <form className="my-8" onSubmit={form.handleSubmit(onSubmit)}>
          <LabelInputContainer className="mb-4">
            <Label htmlFor="email">Email Address</Label>
            <Input id="email" placeholder="example@gmail.com" type="email" {...form.register('email')} />
            {errors.email && <p className="text-sm text-red-500">{errors.email?.message}</p>}
          </LabelInputContainer>
          <LabelInputContainer className="mb-4">
            <Label htmlFor="password">Password</Label>
            <Input id="password" placeholder="••••••••" type="password" {...form.register('password')} />
            {errors.password && <p className="text-sm text-red-500">{errors.password?.message}</p>}
          </LabelInputContainer>

          <button
            className="group/btn relative block h-10 w-full rounded-md bg-gradient-to-br from-black to-neutral-600 font-medium text-white shadow-[0px_1px_0px_0px_#ffffff40_inset,0px_-1px_0px_0px_#ffffff40_inset] dark:bg-zinc-800 dark:from-zinc-900 dark:to-zinc-900 dark:shadow-[0px_1px_0px_0px_var(--zinc-800)_inset,0px_-1px_0px_0px_var(--zinc-800)_inset]"
            type="submit"
          >
            Login &rarr;
            <BottomGradient />
          </button>

          <div className="my-8 h-[1px] w-full bg-gradient-to-r from-transparent via-neutral-300 to-transparent dark:via-neutral-700" />

          <div className="flex flex-col space-y-4">
            <button
              className="group/btn relative flex h-10 w-full items-center justify-start space-x-2 rounded-md bg-gray-50 px-4 font-medium text-black shadow-input dark:bg-zinc-900 dark:shadow-[0px_0px_1px_1px_var(--neutral-800)]"
              type="submit"
            >
              <Icons.Google className="h-4 w-4 text-neutral-800 dark:text-neutral-300" />
              <span className="text-sm text-neutral-700 dark:text-neutral-300">Google</span>
              <BottomGradient />
            </button>
          </div>
        </form>
      </FormProvider>
    </div>
  );
}

const BottomGradient = () => {
  return (
    <>
      <span className="absolute inset-x-0 -bottom-px block h-px w-full bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-0 transition duration-500 group-hover/btn:opacity-100" />
      <span className="absolute inset-x-10 -bottom-px mx-auto block h-px w-1/2 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-0 blur-sm transition duration-500 group-hover/btn:opacity-100" />
    </>
  );
};

const LabelInputContainer = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  return <div className={cn('flex w-full flex-col space-y-2', className)}>{children}</div>;
};
