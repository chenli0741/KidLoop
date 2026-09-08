import type { AuthUser } from './types';

/** Demo-only policy for the single designated login. */
export function isTestAccount(user: Pick<AuthUser, 'email'>) {
  return user.email.trim().toLowerCase() === 'test@test.kidloop.local';
}
