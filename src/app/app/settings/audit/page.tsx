import type { Metadata } from "next";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, humanize } from "@/components/status-badge";
import { requirePageContext } from "@/lib/auth/context";
import { formatDateTime } from "@/lib/domain/dates";

export const metadata: Metadata = { title: "Audit log" };

const IGNORED = new Set(["id", "school_id", "created_at", "updated_at"]);

function changes(oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null) {
  if (!oldData || !newData) return null;
  return Object.keys(newData)
    .filter((k) => !IGNORED.has(k) && JSON.stringify(oldData[k]) !== JSON.stringify(newData[k]))
    .map((k) => `${k}: ${JSON.stringify(oldData[k])} → ${JSON.stringify(newData[k])}`)
    .slice(0, 4)
    .join("; ");
}

/** Read-only view; the table itself rejects edits and deletes (see migrations). */
export default async function AuditPage({ searchParams }: PageProps<"/app/settings/audit">) {
  const ctx = await requirePageContext("audit.view");
  const sp = await searchParams;
  const rows = await ctx.db((sql) =>
    sql.many<{ id: number; created_at: string; actor: string | null; action: string; entity_type: string; entity_id: string | null; reason: string | null; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null }>(
      `select l.id, l.created_at, p.full_name as actor, l.action, l.entity_type, l.entity_id, l.reason, l.old_data, l.new_data
       from audit_logs l left join user_profiles p on p.id = l.actor_user_id
       where l.school_id = $1 and l.actor_user_id is not null
       order by l.id desc limit 1000`,
      [ctx.schoolId],
    ),
  );
  const types = [...new Set(rows.map((r) => r.entity_type))].sort();
  return (
    <>
      <PageHeader title="Audit log" description="Changes made by people in this school (latest 1,000). Entries cannot be edited or deleted by anyone." />
      <DataTable
        rows={rows}
        rowKey={(r) => String(r.id)}
        searchParams={sp}
        pageSize={40}
        search={{ placeholder: "Search person, reason or record", text: (r) => `${r.actor ?? ""} ${r.reason ?? ""} ${r.entity_type} ${r.entity_id ?? ""}` }}
        filters={[
          { param: "type", label: "Record type", options: types.map((t) => ({ value: t, label: humanize(t) })), match: (r, v) => r.entity_type === v },
          { param: "action", label: "Action", options: ["insert", "update", "delete", "export"].map((a) => ({ value: a, label: humanize(a) })), match: (r, v) => r.action === v },
        ]}
        empty={{ title: "No recorded changes yet" }}
        columns={[
          { key: "when", header: "When", cell: (r) => <span className="text-sm whitespace-nowrap">{formatDateTime(r.created_at)}</span> },
          { key: "who", header: "Who", cell: (r) => r.actor ?? "—" },
          { key: "what", header: "What", cell: (r) => <span><StatusBadge status={r.action} tone={r.action === "delete" ? "danger" : r.action === "update" ? "warning" : "neutral"} /> <span className="ml-1 text-sm">{humanize(r.entity_type)}</span></span> },
          {
            key: "detail",
            header: "Details",
            cell: (r) => (
              <span className="block max-w-md text-xs text-muted-foreground">
                {changes(r.old_data, r.new_data) ?? ""}
                {r.reason && <span className="block text-foreground">Reason: {r.reason}</span>}
              </span>
            ),
            hideBelow: "md",
          },
        ]}
      />
    </>
  );
}
