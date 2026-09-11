"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BusFront, CalendarDays, Gauge, MapPinned, UsersRound, ShieldCheck } from "lucide-react";
import { AccountMenu } from "@/components/account-menu";
import type { AuthUser } from "@/lib/types";
import { useLocale } from "@/components/locale-provider";
import { text } from "@/lib/i18n";

export function AppNavigation({ user }: { user: AuthUser }) {
  const pathname = usePathname();
  const locale = useLocale();
  const items = user.role === "PARENT" ? [
    { href: "/parent", label: text(locale, "我的孩子", "My children"), icon: UsersRound },
  ] : user.role === "DRIVER" ? [
    { href: "/driver", label: text(locale, "行程", "Trips"), icon: BusFront },
    { href: "/driver/week", label: text(locale, "日程", "Schedule"), icon: CalendarDays },
  ] : [
    { href: "/", label: text(locale, "今日", "Today"), icon: Gauge },
    { href: "/schedule", label: text(locale, "学校", "Schools"), icon: CalendarDays },
    { href: "/routes", label: text(locale, "排班", "Scheduling"), icon: BusFront },
    { href: "/students", label: text(locale, "学生", "Students"), icon: UsersRound },
    { href: "/resources", label: text(locale, "资料", "Resources"), icon: MapPinned },
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><BusFront size={21} aria-hidden="true" /></div>
        <div className="brand-identity">
          <strong>Kid Loop Rides</strong>
          <span title={user.name}>{user.role === "PARENT" ? text(locale, "家长端", "Parent") : user.role === "DRIVER" ? text(locale, "司机端", "Driver") : text(locale, "运营管理", "Operations")} · {user.name}</span>
        </div>
      </div>
      <nav data-role={user.role} aria-label={text(locale, "主导航", "Main navigation")}>
        {items.map(({ href, label, icon: Icon }) => {
          const active = (href === "/" || href === "/driver") ? pathname === href : pathname.startsWith(href);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} className={active ? "nav-link active" : "nav-link"}>
              <Icon size={19} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      {user.role === "ADMIN" && <Link className="nav-link desktop-only admin-entry" href="/admin/accounts" aria-current={pathname.startsWith("/admin/accounts") ? "page" : undefined}><ShieldCheck size={19} />{text(locale, "后台账号管理", "Account administration")}</Link>}
      <AccountMenu user={user} />
    </aside>
  );
}
