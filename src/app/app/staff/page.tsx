import type { Metadata } from "next";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, humanize } from "@/components/status-badge";
import { requirePageContext } from "@/lib/auth/context";
import { ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import { listStaff } from "@/lib/data/academics";
import { InviteDialog } from "../students/[id]/student-actions";
import { StaffDialog } from "./staff-dialog";

export const metadata: Metadata = { title: "Staff" };

const ROLE_FOR_TYPE: Record<string, Role> = {
  teaching: "teacher",
  administrative: "school_admin",
  accounts: "accountant",
  transport: "driver",
  support: "teacher",
};

export default async function StaffPage({ searchParams }: PageProps<"/app/staff">) {
  const ctx = await requirePageContext("staff.view");
  const sp = await searchParams;
  const staff = await ctx.db((sql) => listStaff(sql, ctx.schoolId));
  const maxCode = staff.map((s) => Number(s.employee_code.replace(/\D/g, ""))).filter(Number.isFinite).reduce((a, b) => Math.max(a, b), 0);
  const prefix = staff[0]?.employee_code.replace(/\d+$/, "") ?? "EMP-";

  return (
    <>
      <PageHeader
        title="Staff"
        description="Teachers, office, accounts and transport staff. Teaching assignments are managed in Classes & subjects."
        actions={<StaffDialog nextCode={`${prefix}${String(maxCode + 1).padStart(3, "0")}`} />}
      />
      <DataTable
        rows={staff}
        rowKey={(r) => r.id}
        searchParams={sp}
        caption="Staff"
        search={{ placeholder: "Search name, code or phone", text: (r) => `${r.full_name} ${r.employee_code} ${r.phone ?? ""} ${r.email ?? ""}` }}
        filters={[
          { param: "type", label: "Type", options: ["teaching", "administrative", "accounts", "transport", "support"].map((t) => ({ value: t, label: humanize(t) })), match: (r, v) => r.staff_type === v },
          { param: "status", label: "Status", options: ["active", "on_leave", "left"].map((t) => ({ value: t, label: humanize(t) })), match: (r, v) => r.status === v },
        ]}
        empty={{ title: "No staff yet", description: "Add your teachers and office staff." }}
        columns={[
          {
            key: "name",
            header: "Name",
            sort: (r) => r.full_name,
            cell: (r) => (
              <span>
                <span className="font-medium">{r.full_name}</span>
                <span className="block text-xs text-muted-foreground">{r.designation}</span>
              </span>
            ),
          },
          { key: "code", header: "Code", sort: (r) => r.employee_code, cell: (r) => r.employee_code, hideBelow: "sm" },
          { key: "type", header: "Type", sort: (r) => r.staff_type, cell: (r) => humanize(r.staff_type), hideBelow: "md" },
          {
            key: "teaching",
            header: "Teaching",
            cell: (r) =>
              r.staff_type === "teaching" ? (
                <span className="text-sm">
                  {r.class_teacher_of ? `Class teacher: ${r.class_teacher_of}` : "—"}
                  <span className="block text-xs text-muted-foreground">{r.subjects_taught} subject assignments</span>
                </span>
              ) : (
                "—"
              ),
            hideBelow: "lg",
          },
          {
            key: "login",
            header: "App access",
            cell: (r) =>
              r.roles?.length ? (
                <span className="flex flex-wrap gap-1">
                  {r.roles.map((role) => (
                    <StatusBadge key={role} status="active" label={ROLE_LABELS[role as Role]} />
                  ))}
                </span>
              ) : r.status === "left" ? (
                "—"
              ) : (
                <InviteDialog
                  role={ROLE_FOR_TYPE[r.staff_type] ?? "teacher"}
                  roleOptions={["teacher", "school_admin", "accountant", "transport_coordinator", "driver"]}
                  defaults={{ email: r.email ?? "", fullName: r.full_name }} link={{ staffId: r.id }} triggerLabel="Invite" />
              ),
          },
          { key: "status", header: "Status", sort: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
          { key: "edit", header: "", cell: (r) => <StaffDialog staff={r} />, align: "right" },
        ]}
      />
    </>
  );
}
