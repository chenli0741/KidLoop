import { getUser } from "@/lib/auth";
import type { Metadata, Viewport } from "next";
import { AppNavigation } from "@/components/app-navigation";
import { LocaleProvider } from "@/components/locale-provider";
import { text } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import "./globals.css";
import "./mobile.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f5f7f5",
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: text(locale, "KidLoop 运营管理", "KidLoop Operations"),
    description: text(locale, "课后接送与家庭出行管理", "After-school transportation and family ride management"),
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [locale, user] = await Promise.all([getLocale(), getUser()]);
  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"}>
      <body>
        <LocaleProvider locale={locale}>
          {user ? <div className="app-shell">
            <AppNavigation user={user} />
            <main className="app-main">{children}</main>
          </div> : children}
        </LocaleProvider>
      </body>
    </html>
  );
}
