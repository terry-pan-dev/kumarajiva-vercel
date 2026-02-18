import { useRouteError } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import AuthForm from '~/components/AuthForm';
import { ErrorInfo } from '~/components/ErrorInfo';
import { FormInput } from '~/components/FormModal';
import { Spacer } from '~/components/ui/spacer';
import { logger } from '~/lib/logger';
import { validatePayloadOrThrow } from '~/lib/payload.validation';
import { readUserByEmail, updateUserPassword } from '~/services/user.service';

const schema = z.object({
  new_pass: z.string().min(8),
  confirm_pass: z.string().min(8),
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const email = url.searchParams.get('email');
  if (!email) {
    return redirect('/login');
  }
  const isFromLoginPage = request.headers.get('Referer')?.includes('/login');
  console.log('isFromLoginPage', Boolean(isFromLoginPage));
  if (isFromLoginPage) {
    return json({ email });
  }
  throw new Error('Invalid request');
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const clonedRequest = request.clone();
    const form = Object.fromEntries(await clonedRequest.formData());
    const result = validatePayloadOrThrow({ schema, formData: form });
    const url = new URL(clonedRequest.url);
    const email = url.searchParams.get('email');
    logger.log('update_password route: ', 'email', email);
    logger.info('update_password route: ', 'before validation');
    if (!email) {
      return redirect('/login');
    }
    if (!result.new_pass || !result.confirm_pass) {
      return json({ success: false, errors: { password: 'password cannot be empty' } }, { status: 400 });
    }
    if (result.new_pass !== result.confirm_pass) {
      return json({ success: false, errors: { password: 'two passwords are not equal' } }, { status: 400 });
    }
    logger.info('update_password route: ', 'after validation');

    logger.info('update_password route: ', 'before authentication');
    const user = await readUserByEmail(email);
    logger.info('update_password route: ', 'after authentication');
    if (user) {
      logger.info('update_password route: ', 'before update password');
      const hashedPassword = await bcrypt.hash(result.confirm_pass, 10);
      await updateUserPassword({ email: user.email, password: hashedPassword });
      //   await updateUser({ PK: user.PK, SK: user.SK, linkValidUtil: '' });
      logger.info('update_password route: ', 'after update password');

      return redirect('/dashboard');
    }
    return redirect('/login');
  } catch (error) {
    logger.error('update_password route: ', 'message', (error as Error)?.message);
    logger.error('update_password route: ', 'stack trace', (error as Error)?.stack);
    return json({ success: false, errors: { password: 'Internal Server Error' } }, { status: 500 });
  }
};

export const ErrorBoundary = () => {
  const error = useRouteError();

  return <ErrorInfo error={error} />;
};

export default function UpdatePasswordRoute() {
  // const { email } = useLoaderData<typeof loader>();
  return (
    <div className="mx-auto w-full max-w-md rounded-none bg-white p-4 shadow-input dark:bg-black md:rounded-2xl md:p-8">
      <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-200">Update Password</h2>
      <p className="mt-2 max-w-sm text-sm text-neutral-600 dark:text-neutral-300">
        Please update your initial password to continue.
      </p>

      <Spacer />
      <AuthForm schema={schema} defaultValues={{ new_pass: '', confirm_pass: '' }}>
        <div className="flex flex-col space-y-4">
          {/* <HiddenInput name="email" value={email} /> */}
          <FormInput required name="new_pass" type="password" label="New Password" placeholder="••••••••" />
          <FormInput required type="password" name="confirm_pass" placeholder="••••••••" label="Confirm Password" />
          <button
            type="submit"
            className="group/btn relative block h-10 w-full rounded-md bg-gradient-to-br from-black to-neutral-600 font-medium text-white shadow-[0px_1px_0px_0px_#ffffff40_inset,0px_-1px_0px_0px_#ffffff40_inset] dark:bg-zinc-800 dark:from-zinc-900 dark:to-zinc-900 dark:shadow-[0px_1px_0px_0px_var(--zinc-800)_inset,0px_-1px_0px_0px_var(--zinc-800)_inset]"
          >
            Update Password &rarr;
          </button>
        </div>
      </AuthForm>
    </div>
  );
}
