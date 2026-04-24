import type { LoaderFunctionArgs } from '@remix-run/node';

import { GoogleStrategy } from '@coji/remix-auth-google';
import { redirect } from '@remix-run/node';
import bcrypt from 'bcryptjs';
import { Authenticator } from 'remix-auth';
import { FormStrategy } from 'remix-auth-form';

import type { ReadUser } from '~/drizzle/tables';

import { logger } from '~/lib/logger';
import { readUserByEmail } from '~/services/user.service';

import { destroySession, getSession } from './session.server';

export const SESSION_USER_KEY = 'user';

export const authenticator = new Authenticator<ReadUser | undefined>();

const credentialStrategy = new FormStrategy(async ({ form }) => {
  const email = form.get('email');
  const password = form.get('password');

  if (!email || !password) {
    return undefined;
  }

  logger.info('authenticator', 'before readUserByEmail');
  let user;
  try {
    user = await readUserByEmail(email as string);
  } catch (error) {
    console.log('authenticator', error);
  }
  logger.info('authenticator', 'after readUserByEmail');
  logger.log('authenticator', {
    userId: user?.id,
    email: user?.email,
    role: user?.role,
  });
  if (user) {
    logger.info('authenticator', 'before bcrypt compare');
    const isValid = await bcrypt.compare(password as string, user.password);
    logger.info('authenticator', 'after bcrypt compare');
    logger.log('authenticator', 'isValid', isValid);
    if (isValid) {
      const newUser = { ...user, password: '', avatar: '' };
      return newUser;
    }
    return undefined;
  }
  return undefined;
});

const envMapper = {
  development: 'http://localhost:3000',
  preview: 'https://kumarajiva-vercel-terrypandevs-projects.vercel.app',
  production: 'https://btts-kumarajiva.org',
};

const googleStrategy = new GoogleStrategy(
  {
    clientId: process.env.GOOGLE_CLIENT_ID as string,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    redirectURI: `${envMapper[(process.env.VERCEL_ENV as keyof typeof envMapper) || 'development']}/auth/google/callback`,
  },
  async ({ tokens }) => {
    const profile = await GoogleStrategy.userProfile(tokens);
    const user = await readUserByEmail(profile.emails[0].value);
    if (!user) {
      throw new Error('user not found');
    }
    return { ...user, avatar: '', password: '' };
  },
);

authenticator.use(credentialStrategy, 'credential').use(googleStrategy, 'google');

export const assertAuthUser = async (request: LoaderFunctionArgs['request']) => {
  const session = await getSession(request.headers.get('Cookie'));
  const prevUser = session.get(SESSION_USER_KEY) as ReadUser | undefined;

  if (!prevUser) {
    throw redirect('/login');
  }

  const latestUser = await readUserByEmail(prevUser.email as string);
  if (
    !latestUser?.role.includes(prevUser?.role || '') ||
    latestUser?.originLang !== prevUser?.originLang ||
    latestUser?.targetLang !== prevUser?.targetLang
  ) {
    await destroySession(session);
    return undefined;
  }

  return {
    ...prevUser,
    avatar: latestUser?.avatar,
    password: '',
  };
};
