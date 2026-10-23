import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, Trophy } from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { humanize } from "@/components/status-badge";
import { requirePageContext } from "@/lib/auth/context";
import { studentPortfolio } from "@/lib/data/activities";
import { currentYear, schoolProfile } from "@/lib/data/school";
import { formatDate } from "@/lib/domain/dates";
import { CATEGORY_LABELS } from "@/lib/schemas/activities";

export const metadata: Metadata = { title: "Development report" };

const LEVEL_RANK = ["school", "zonal", "district", "state", "national", "international"];

/** Printable student development report: activities, participation and verified achievements. */
export default async function PortfolioPage({ params }: PageProps<"/app/activities/portfolio/[studentId]">) {
  const ctx = await requirePageContext("activities.view");
  const { studentId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) notFound();
  const d = await ctx.db(async (sql) => {
    const student = await sql.maybeOne<{ name: string; admission_no: string; section_label: string | null }>(
      `select trim(s.first_name || ' ' || s.last_name) as name, s.admission_no, c.name || ' ' || sec.name as section_label
       from students s left join enrollments e on e.student_id = s.id and e.status = 'active'
       left join sections sec on sec.id = e.section_id left join classes c on c.id = sec.class_id where s.id = $1`,
      [studentId],
    );
    if (!student) return null;
    return { student, school: await schoolProfile(sql, ctx.schoolId), year: await currentYear(sql, ctx.schoolId), ...(await studentPortfolio(sql, ctx.schoolId, studentId)) };
  });
  if (!d) notFound();
  const verified = d.achievements.filter((a) => a.status === "verified");
  const pending = d.achievements.filter((a) => a.status === "pending");
  const highest = verified.reduce<string | null>((h, a) => (!h || LEVEL_RANK.indexOf(a.level) > LEVEL_RANK.indexOf(h) ? a.level : h), null);
  const categories = [...new Set([...d.activities.map((a) => a.category), ...verified.map((a) => a.category)])];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/app/activities" className="text-sm text-muted-foreground hover:text-foreground">
          ← Activities
        </Link>
        <PrintButton />
      </div>
      <article className="print-sheet rounded-xl border bg-card p-6 shadow-sm sm:p-10">
        <header className="border-b pb-4 text-center">
          <h1 className="text-xl font-bold">{d.school.name}</h1>
          <p className="mt-1 text-sm font-semibold tracking-wide uppercase">Student development report · {d.year.name}</p>
        </header>
        <div className="grid grid-cols-2 gap-4 py-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-muted-foreground">Student</p>
            <p className="font-medium">{d.student.name}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Class</p>
            <p className="font-medium">{d.student.section_label ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Activities</p>
            <p className="font-medium">{d.activities.filter((a) => a.status === "registered").length}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Verified achievements</p>
            <p className="font-medium">
              {verified.length}
              {highest && <span className="text-muted-foreground"> · up to {humanize(highest)} level</span>}
            </p>
          </div>
        </div>

        <section className="mt-2">
          <h2 className="mb-2 font-semibold">Areas of involvement</h2>
          <p className="text-sm">{categories.length ? categories.map((c) => CATEGORY_LABELS[c]).join(" · ") : "No activities recorded yet."}</p>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 font-semibold">Activities & participation</h2>
          {d.activities.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not registered for any activity.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted/50 text-left">
                  <th className="border px-2 py-1.5">Activity</th>
                  <th className="border px-2 py-1.5">Area</th>
                  <th className="border px-2 py-1.5">Coordinator</th>
                  <th className="border px-2 py-1.5 text-right">Sessions attended</th>
                </tr>
              </thead>
              <tbody>
                {d.activities.map((a) => (
                  <tr key={a.name}>
                    <td className="border px-2 py-1.5">
                      {a.name}
                      {a.status !== "registered" && <span className="text-xs text-muted-foreground"> (withdrawn)</span>}
                    </td>
                    <td className="border px-2 py-1.5">{CATEGORY_LABELS[a.category]}</td>
                    <td className="border px-2 py-1.5">{a.coordinator ?? "—"}</td>
                    <td className="border px-2 py-1.5 text-right tabular">{a.sessions ? `${a.present} / ${a.sessions}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="mt-6">
          <h2 className="mb-3 font-semibold">Achievement timeline</h2>
          {verified.length === 0 ? (
            <p className="text-sm text-muted-foreground">No verified achievements yet.</p>
          ) : (
            <ol className="relative grid gap-4 border-l pl-6">
              {verified.map((a) => (
                <li key={a.id} className="relative">
                  <span className="absolute top-0.5 -left-[33px] flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    {LEVEL_RANK.indexOf(a.level) >= 2 ? <Trophy className="size-3.5" aria-hidden /> : <Award className="size-3.5" aria-hidden />}
                  </span>
                  <p className="text-xs text-muted-foreground">{formatDate(a.achieved_on)}</p>
                  <p className="font-medium">
                    {a.title}
                    {a.position && <span className="text-muted-foreground"> — {a.position}</span>}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {CATEGORY_LABELS[a.category]} · {humanize(a.level)} level{a.activity_name && ` · ${a.activity_name}`}
                  </p>
                  {a.description && <p className="text-sm">{a.description}</p>}
                </li>
              ))}
            </ol>
          )}
          {pending.length > 0 && <p className="no-print mt-4 text-xs text-muted-foreground">{pending.length} submitted achievement(s) are awaiting verification and are not shown on the report.</p>}
        </section>

        <footer className="mt-12 grid grid-cols-3 gap-6 text-center text-xs text-muted-foreground">
          {["Activity coordinator", "Principal", "Parent / guardian"].map((s) => (
            <div key={s} className="border-t pt-1">
              {s}
            </div>
          ))}
        </footer>
      </article>
    </div>
  );
}
