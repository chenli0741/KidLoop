"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BusFront, CalendarDays, Gauge, MapPinned, UsersRound, ShieldCheck, LogOut } from "lucide-react";
import { logout } from "@/app/login/actions";
import type { AuthUser } from "@/lib/types";
import { setLocale } from "@/app/actions";
import { useLocale } from "@/components/locale-provider";
import { text } from "@/lib/i18n";

export function AppNavigation({ user }: { user: AuthUser }) {
  const pathname = usePathname();
  const locale = useLocale();
  const items = user.role === "PARENT" ? [
    { href: "/parent", label: text(locale, "我的孩子", "My children"), icon: UsersRound },
  ] : user.role === "DRIVER" ? [
    { href: "/driver", label: text(locale, "我的行程", "My trips"), icon: BusFront },
  ] : [
    { href: "/", label: text(locale, "今日", "Today"), icon: Gauge },
    { href: "/schedule", label: text(locale, "排班", "Schedule"), icon: CalendarDays },
    { href: "/students", label: text(locale, "学生", "Students"), icon: UsersRound, ShieldCheck, LogOut },
    { href: "/fleet", label: text(locale, "车队", "Fleet"), icon: BusFront },
    { href: "/accounts", label: text(locale, "账号", "Accounts"), icon: ShieldCheck },
    { href: "/locations", label: text(locale, "地点", "Locations"), icon: MapPinned },
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><BusFront size={21} aria-hidden="true" /></div>
        <div>
          <strong>KidLoop</strong>
          <span>{user.role === "PARENT" ? text(locale, "家长端", "Parent") : user.role === "DRIVER" ? text(locale, "司机端", "Driver") : text(locale, "运营管理", "Operations")}</span>
        </div>
      </div>
      <nav data-role={user.role} aria-label={text(locale, "主导航", "Main navigation")}>
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} className={active ? "nav-link active" : "nav-link"}>
              <Icon size={19} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <form action={setLocale} className="language-switcher" aria-label={text(locale, "语言", "Language")}>
        <button type="submit" name="locale" value="zh" className={locale === "zh" ? "active" : ""} aria-pressed={locale === "zh"}>中文</button>
        <button type="submit" name="locale" value="en" className={locale === "en" ? "active" : ""} aria-pressed={locale === "en"}>EN</button>
      </form>
      <form action={logout} className="logout-form"><button type="submit" title={text(locale, "退出登录", "Sign out")}><LogOut size={18} /><span>{text(locale, "退出", "Sign out")}</span></button></form>
      <div className="sidebar-footer">{user.name}</div>
    </aside>
  );
}
