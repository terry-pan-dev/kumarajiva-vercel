import type { LoaderFunctionArgs } from '@remix-run/node';
import { type ReadUser } from '~/drizzle/tables';
import { logger } from '~/lib/logger';
import { readUserByEmail } from '~/services/user.service';
import bcrypt from 'bcryptjs';
import { Authenticator } from 'remix-auth';
import { FormStrategy } from 'remix-auth-form';
import { GoogleStrategy } from 'remix-auth-google';
import { destroySession, getSession, sessionStorage } from './session.server';

export const authenticator = new Authenticator<ReadUser | undefined>(sessionStorage);

const credentialStrategy = new FormStrategy(async ({ form, context }) => {
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
  logger.log('authenticator', 'user', user);
  if (user) {
    logger.info('authenticator', 'before bcrypt compare');
    const isValid = await bcrypt.compare(password as string, user.password);
    logger.info('authenticator', 'after bcrypt compare');
    logger.log('authenticator', 'isValid', isValid);
    if (isValid) {
      // not need expose hashed password to frontend
      const newUser = { ...user, password: '' };
      return newUser;
    }
    return undefined;
  }
  return undefined;
});

const googleStrategy = new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID as string,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    callbackURL: `${
      process.env.ENV === 'prod' ? 'https://btts-kumarajiva.org' : 'http://localhost:3000'
    }/auth/google/callback`,
  },
  async ({ accessToken, refreshToken, extraParams, profile }) => {
    const user = await readUserByEmail(profile.emails[0].value);
    if (!user) {
      throw new Error('user not found');
    }
    return user;
  },
);

authenticator.use(credentialStrategy, 'credential').use(googleStrategy, 'google');

export const assertAuthUser = async (request: LoaderFunctionArgs['request']) => {
  const prevUser = await authenticator.isAuthenticated(request, {
    failureRedirect: '/login',
  });
  const session = await getSession(request.headers.get('Cookie'));
  const latestUser = await readUserByEmail(prevUser?.email as string);
  if (
    !latestUser?.role.includes(prevUser?.role || '') ||
    latestUser?.originLang !== prevUser?.originLang ||
    latestUser?.targetLang !== prevUser?.targetLang
  ) {
    await destroySession(session);
    return undefined;
  }
  return prevUser;
};
