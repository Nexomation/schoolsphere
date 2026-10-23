"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  Bus,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  FileText,
  GraduationCap,
  IndianRupee,
  LayoutDashboard,
  Megaphone,
  Navigation,
  NotebookPen,
  School,
  Settings,
  Sparkles,
  Trophy,
  Users,
  Baby,
  type LucideIcon,
} from "lucide-react";
import type { NavGroup, NavIcon } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  students: GraduationCap,
  staff: Users,
  academics: School,
  timetable: CalendarClock,
  calendar: CalendarDays,
  attendance: ClipboardCheck,
  homework: NotebookPen,
  exams: FileText,
  fees: IndianRupee,
  transport: Bus,
  driver: Navigation,
  activities: Trophy,
  announcements: Megaphone,
  notifications: Bell,
  ai: Sparkles,
  reports: BarChart3,
  settings: Settings,
  children: Baby,
};

export function SidebarNav({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/app" ? pathname === "/app" : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <nav aria-label="Main" className="flex flex-col gap-5 px-3 py-4">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-1 px-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{group.label}</p>
          <ul className="grid gap-0.5">
            {group.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      active && "bg-sidebar-accent text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
