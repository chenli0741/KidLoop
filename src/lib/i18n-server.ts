import "server-only";

import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "@/lib/i18n";

import { getUser } from './auth';
import { isTestAccount } from './test-account';

export async function getLocale(): Promise<Locale> {
  const user = await getUser();
  if (user && isTestAccount(user)) return DEFAULT_LOCALE;
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
