import type { Metadata } from "next";
import { ConfirmAction } from "@/components/confirm-action";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageContext } from "@/lib/auth/context";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/domain/dates";
import { InviteDialog } from "../../students/[id]/student-actions";
import { revokeInvitationAction, setMembershipStatusAction } from "../actions";

export const metadata: Metadata = { title: "Users & access" };

export default async function UsersPage({ searchParams }: PageProps<"/app/settings/users">) {
  const ctx = await requirePageContext("users.manage");
  const sp = await searchParams;
  const d = await ctx.db(async (sql) => ({
    members: await sql.many<{ id: string; user_id: string; name: string; email: string; role: Role; status: string; created_at: string; last_sign_in: string | null }>(
      `select m.id, m.user_id, p.full_name as name, p.email, m.role, m.status, m.created_at, null::timestamptz as last_sign_in
       from school_memberships m join user_profiles p on p.id = m.user_id where m.school_id = $1 order by m.role, p.full_name`,
      [ctx.schoolId],
    ),
    invitations: await sql.many<{ id: string; email: string; full_name: string; role: Role; expires_at: string; created_at: string }>(
      "select id, email, full_name, role, expires_at, created_at from invitations where school_id = $1 and accepted_at is null and revoked_at is null and expires_at > now() order by created_at desc",
      [ctx.schoolId],
    ),
  }));
  return (
    <>
      <PageHeader
        title="Users & access"
        description="Everyone who can sign in to this school, and their roles. One person can hold several roles (for example a teacher who is also a parent)."
        actions={<InviteDialog role="teacher" roleOptions={[...ROLES]} defaults={{ email: "", fullName: "" }} link={{}} triggerLabel="Invite user" />}
      />
      {d.invitations.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
            <CardDescription>Links expire after 7 days. Parents and staff are best invited from their student or staff record so the account is linked automatically.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {d.invitations.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{i.full_name}</span> · {i.email} · {ROLE_LABELS[i.role]}
                    <span className="block text-xs text-muted-foreground">Expires {formatDateTime(i.expires_at)}</span>
                  </span>
                  <ConfirmAction action={revokeInvitationAction.bind(null, i.id)} title="Revoke this invitation?" description="The link will stop working." confirmLabel="Revoke" variant="destructive" />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <DataTable
        rows={d.members}
        rowKey={(r) => r.id}
        searchParams={sp}
        search={{ placeholder: "Search name or email", text: (r) => `${r.name} ${r.email}` }}
        filters={[{ param: "role", label: "Role", options: ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] })), match: (r, v) => r.role === v }]}
        columns={[
          { key: "name", header: "Name", sort: (r) => r.name, cell: (r) => <span><span className="font-medium">{r.name}</span><span className="block text-xs text-muted-foreground">{r.email}</span></span> },
          { key: "role", header: "Role", sort: (r) => r.role, cell: (r) => ROLE_LABELS[r.role] },
          { key: "since", header: "Member since", cell: (r) => formatDateTime(r.created_at), hideBelow: "md" },
          { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status === "active" ? "active" : "suspended"} /> },
          {
            key: "action",
            header: "",
            align: "right",
            cell: (r) =>
              r.id === ctx.active.id ? (
                <span className="text-xs text-muted-foreground">You</span>
              ) : r.status === "active" ? (
                <ConfirmAction action={setMembershipStatusAction.bind(null, r.id, "suspended")} title={`Suspend ${r.name} as ${ROLE_LABELS[r.role]}?`} description="They lose access to this school in that role immediately. Their records are kept." confirmLabel="Suspend" variant="destructive" triggerVariant="ghost" />
              ) : (
                <ConfirmAction action={setMembershipStatusAction.bind(null, r.id, "active")} title={`Restore ${r.name}'s access?`} description="They can sign in again with this role." confirmLabel="Restore" triggerVariant="ghost" />
              ),
          },
        ]}
      />
    </>
  );
}
