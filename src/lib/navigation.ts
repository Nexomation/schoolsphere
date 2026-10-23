import { can, type Permission, type Role } from "./auth/permissions";

export type NavIcon =
  | "dashboard"
  | "students"
  | "staff"
  | "academics"
  | "timetable"
  | "calendar"
  | "attendance"
  | "homework"
  | "exams"
  | "fees"
  | "transport"
  | "driver"
  | "activities"
  | "announcements"
  | "notifications"
  | "ai"
  | "reports"
  | "settings"
  | "children";

export type NavItem = { href: string; label: string; icon: NavIcon; permission: Permission; roles?: Role[] };
export type NavGroup = { label: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/app", label: "Dashboard", icon: "dashboard", permission: "dashboard.view" },
      { href: "/app/driver", label: "My trips", icon: "driver", permission: "transport.drive" },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/app/students", label: "Students", icon: "students", permission: "students.view" },
      { href: "/app/staff", label: "Staff", icon: "staff", permission: "staff.view" },
    ],
  },
  {
    label: "Academics",
    items: [
      { href: "/app/attendance", label: "Attendance", icon: "attendance", permission: "attendance.view" },
      { href: "/app/homework", label: "Homework", icon: "homework", permission: "homework.view" },
      { href: "/app/exams", label: "Exams & results", icon: "exams", permission: "exams.view" },
      { href: "/app/timetable", label: "Timetable", icon: "timetable", permission: "timetable.view" },
      { href: "/app/calendar", label: "Calendar", icon: "calendar", permission: "calendar.view" },
      { href: "/app/academics", label: "Classes & subjects", icon: "academics", permission: "academics.manage" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/app/fees", label: "Fees & payments", icon: "fees", permission: "fees.view" },
      { href: "/app/transport", label: "Transport", icon: "transport", permission: "transport.view" },
      { href: "/app/activities", label: "Activities", icon: "activities", permission: "activities.view" },
    ],
  },
  {
    label: "Communication",
    items: [
      { href: "/app/announcements", label: "Announcements", icon: "announcements", permission: "announcements.view" },
      { href: "/app/notifications", label: "Notifications", icon: "notifications", permission: "dashboard.view" },
      { href: "/app/assistant", label: "AI assistant", icon: "ai", permission: "ai.use" },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/app/reports", label: "Reports", icon: "reports", permission: "reports.view" },
      { href: "/app/settings", label: "Settings", icon: "settings", permission: "settings.manage" },
    ],
  },
];

export function navigationFor(role: Role): NavGroup[] {
  return GROUPS.map((g) => ({
    label: g.label,
    items: g.items.filter((i) => can(role, i.permission) && (!i.roles || i.roles.includes(role))),
  })).filter((g) => g.items.length > 0);
}
