export function todayInOperationsTimeZone() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function formatTime(value: string | null, locale: Locale = "zh") {
  if (!value) return locale === "zh" ? "待定" : "Pending";
  const [hours, minutes] = value.split(":");
  const date = new Date(2000, 0, 1, Number(hours), Number(minutes));
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}

export function formatDate(value: string, locale: Locale = "zh") {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}
import type { Locale } from "@/lib/i18n";
