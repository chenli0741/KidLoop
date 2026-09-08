import "server-only";

import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LANGUAGE_SWITCH_ENABLED, isLocale, LOCALE_COOKIE, type Locale } from "@/lib/i18n";

export async function getLocale(): Promise<Locale> {
  if (!LANGUAGE_SWITCH_ENABLED) return DEFAULT_LOCALE;
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
