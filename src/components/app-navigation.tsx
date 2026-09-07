"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BusFront, CalendarDays, Gauge, MapPinned, UsersRound } from "lucide-react";

const items = [
  { href: "/", label: "Today", icon: Gauge },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/students", label: "Students", icon: UsersRound },
  { href: "/fleet", label: "Fleet", icon: BusFront },
  { href: "/locations", label: "Locations", icon: MapPinned },
];

export function AppNavigation() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><BusFront size={21} aria-hidden="true" /></div>
        <div>
          <strong>KidLoop</strong>
          <span>Operations</span>
        </div>
      </div>
      <nav aria-label="Main navigation">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link key={href} href={href} className={active ? "nav-link active" : "nav-link"}>
              <Icon size={19} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <span className="online-dot" />
        System online
      </div>
    </aside>
  );
}
