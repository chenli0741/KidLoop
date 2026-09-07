import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";

export default async function Loading() {
  const locale = await getLocale();
  return <div className="loading-page" aria-label={text(locale, "加载中", "Loading")}><div className="loading-bar" /></div>;
}
