import type { AuthUser } from './types';

/** Shared Test-account policy, based on login identity rather than display name. */
export function isTestAccount(user: Pick<AuthUser, 'email'>) {
  return user.email.trim().toLowerCase().endsWith('@test.kidloop.local');
}
