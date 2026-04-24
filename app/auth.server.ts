import type { LoaderFunctionArgs } from '@remix-run/node';

import { redirect } from '@remix-run/node';
import bcrypt from 'bcryptjs';
import { Authenticator } from 'remix-auth';
import { FormStrategy } from 'remix-auth-form';
import { OAuth2Strategy } from 'remix-auth-oauth2';

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

const baseUrl = envMapper[(process.env.VERCEL_ENV as keyof typeof envMapper) || 'development'];
const isProduction = process.env.NODE_ENV === 'production';

const googleStrategy = new OAuth2Strategy<ReadUser | undefined>(
  {
    clientId: process.env.GOOGLE_CLIENT_ID as string,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    redirectURI: `${baseUrl}/auth/google/callback`,
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    scopes: [
      'openid',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    cookie: {
      name: 'google_oauth2',
      httpOnly: true,
      maxAge: 60 * 5,
      path: '/',
      sameSite: 'Lax',
      ...(isProduction && { secure: true }),
    },
  },
  async ({ tokens }) => {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.accessToken()}` },
    });
    if (!response.ok) throw new Error('Failed to fetch Google user profile');
    const profile = (await response.json()) as { email: string };
    const user = await readUserByEmail(profile.email);
    if (!user) throw new Error('user not found');
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
