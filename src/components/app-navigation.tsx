"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { BusFront, CalendarDays, ContactRound, Gauge, MapPinned, UsersRound, ShieldCheck } from "lucide-react";
import { AccountMenu } from "@/components/account-menu";
import type { AuthUser } from "@/lib/types";
import { useLocale } from "@/components/locale-provider";
import { text } from "@/lib/i18n";

const compactQuery = "(max-width: 920px)";
function subscribeCompactLayout(notify: () => void) {
  const query = window.matchMedia(compactQuery);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}
const isCompactLayout = () => window.matchMedia(compactQuery).matches;
const serverCompactLayout = () => false;

export function AppNavigation({ user }: { user: AuthUser }) {
  const pathname = usePathname();
  const compact = useSyncExternalStore(subscribeCompactLayout, isCompactLayout, serverCompactLayout);
  useEffect(() => {
    if (!compact) return;
    const shell = document.querySelector<HTMLElement>(".app-shell");
    const viewport = window.visualViewport;
    if (!shell || !viewport) return;
    // WKWebView can pan its visual viewport when focusing a form input.
    // Anchor all chrome to that same viewport, including keyboard transitions.
    const syncViewport = () => {
      shell.style.setProperty("--app-viewport-top", `${viewport.offsetTop}px`);
      shell.style.setProperty("--app-viewport-height", `${viewport.height}px`);
    };
    syncViewport();
    viewport.addEventListener("resize", syncViewport);
    viewport.addEventListener("scroll", syncViewport);
    return () => {
      viewport.removeEventListener("resize", syncViewport);
      viewport.removeEventListener("scroll", syncViewport);
      shell.style.removeProperty("--app-viewport-top");
      shell.style.removeProperty("--app-viewport-height");
    };
  }, [compact]);
  const resetContentScroll = () => {
    if (!compact) return;
    // Only the content pane scrolls. Never ask iOS to reposition the document.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    document.querySelector(".app-main")?.scrollTo({ top: 0, left: 0, behavior: "instant" });
  };
  const locale = useLocale();
  const items = user.role === "PARENT" ? [
    { href: "/parent", label: text(locale, "我的孩子", "My children"), icon: UsersRound },
    { href: "/parent/children", label: text(locale, "资料", "Details"), icon: ContactRound },
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
          <strong title={user.tenantName}>{user.tenantName ?? "Kid Loop Rides"}</strong>
          <span title={user.name}>{user.role === "PARENT" ? text(locale, "家长端", "Parent") : user.role === "DRIVER" ? text(locale, "司机端", "Driver") : text(locale, "运营管理", "Operations")} · {user.name}</span>
        </div>
      </div>
      <nav data-role={user.role} aria-label={text(locale, "主导航", "Main navigation")}>
        {items.map(({ href, label, icon: Icon }) => {
          const active = (href === "/" || href === "/driver" || href === "/parent") ? pathname === href : pathname.startsWith(href);
          return (
            <Link key={href} href={href} scroll={compact ? false : undefined} onNavigate={resetContentScroll} aria-current={active ? "page" : undefined} className={active ? "nav-link active" : "nav-link"}>
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
