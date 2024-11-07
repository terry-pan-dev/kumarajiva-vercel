import type { ReadUser } from '~/drizzle/tables';
import { Authenticator } from 'remix-auth';
import { sessionStorage } from './session.server';

export const authenticator = new Authenticator<ReadUser | undefined>(sessionStorage);
