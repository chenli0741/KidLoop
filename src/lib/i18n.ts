export type Locale = "zh" | "en";

export const DEFAULT_LOCALE: Locale = "en";
export const LANGUAGE_SWITCH_ENABLED = false;
export const LOCALE_COOKIE = "kidloop_locale";

export function isLocale(value: string | undefined): value is Locale {
  return value === "zh" || value === "en";
}

export function text(locale: Locale, zh: string, en: string) {
  return locale === "zh" ? zh : en;
}
