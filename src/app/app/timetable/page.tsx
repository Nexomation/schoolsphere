import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { TimetableGrid } from "@/components/timetable-grid";
import { UrlPicker } from "@/components/url-controls";
import { requirePageContext } from "@/lib/auth/context";
import { listStaff, timetableForSection, timetableForStaff } from "@/lib/data/academics";
import { currentYear, familyChildren, myStaffId, pickChild, schoolToday, sectionsOfYear, subjectsOf } from "@/lib/data/school";
import { isoWeekday } from "@/lib/domain/dates";
import { CellEditor } from "./cell-editor";

export const metadata: Metadata = { title: "Timetable" };

export default async function TimetablePage({ searchParams }: PageProps<"/app/timetable">) {
  const ctx = await requirePageContext("timetable.view");
  const sp = await searchParams;
  const today = await ctx.db((sql) => schoolToday(sql, ctx.schoolId));
  const weekday = isoWeekday(today);

  if (ctx.role === "teacher") {
    const cells = await ctx.db(async (sql) => {
      const staffId = await myStaffId(sql, ctx.schoolId, ctx.userId);
      return staffId ? timetableForStaff(sql, staffId) : [];
    });
    return (
      <>
        <PageHeader title="My timetable" description="Your periods across all sections this year." />
        {cells.length ? <TimetableGrid cells={cells} mode="teacher" todayWeekday={weekday} /> : <EmptyState title="No periods assigned" description="Ask the office to add you to the timetable." />}
      </>
    );
  }

  if (ctx.role === "parent" || ctx.role === "student") {
    const data = await ctx.db(async (sql) => {
      const children = await familyChildren(sql, ctx.schoolId);
      const child = pickChild(children, sp.child);
      return { children, child, cells: child?.section_id ? await timetableForSection(sql, child.section_id) : [] };
    });
    return (
      <>
        <PageHeader
          title="Timetable"
          description={data.child ? `${data.child.full_name} · ${data.child.section_label ?? ""}` : undefined}
          actions={
            data.children.length > 1 && (
              <UrlPicker param="child" label="Child" value={data.child!.id} options={data.children.map((c) => ({ value: c.id, label: c.full_name }))} />
            )
          }
        />
        {data.cells.length ? <TimetableGrid cells={data.cells} mode="section" todayWeekday={weekday} /> : <EmptyState title="Timetable not published yet" />}
      </>
    );
  }

  // Administrator: view and edit any section.
  const data = await ctx.db(async (sql) => {
    const year = await currentYear(sql, ctx.schoolId);
    const sections = await sectionsOfYear(sql, ctx.schoolId, year.id);
    const sectionId = sections.find((s) => s.id === sp.section)?.id ?? sections[0]?.id;
    return {
      sections,
      sectionId,
      cells: sectionId ? await timetableForSection(sql, sectionId) : [],
      subjects: (await subjectsOf(sql, ctx.schoolId)).filter((s) => s.is_active),
      staff: (await listStaff(sql, ctx.schoolId)).filter((s) => s.status === "active" && s.staff_type === "teaching"),
    };
  });
  const canEdit = ctx.role === "school_admin";

  return (
    <>
      <PageHeader
        title="Timetable"
        description={canEdit ? "Select a cell to change the subject or teacher. A teacher cannot be booked in two sections in the same period." : undefined}
        actions={
          data.sectionId && (
            <UrlPicker param="section" label="Section" value={data.sectionId} options={data.sections.map((s) => ({ value: s.id, label: s.label }))} />
          )
        }
      />
      {!data.sectionId ? (
        <EmptyState title="No sections yet" description="Create classes and sections first." />
      ) : (
        <TimetableGrid
          cells={data.cells}
          mode="section"
          todayWeekday={weekday}
          renderCell={
            canEdit
              ? (day, period, cell) => (
                  <CellEditor
                    sectionId={data.sectionId!}
                    day={day}
                    period={period}
                    cell={cell ? { id: cell.id, subjectId: cell.subject_id, staffId: cell.staff_id, startTime: cell.start_time.slice(0, 5), endTime: cell.end_time.slice(0, 5), subjectName: cell.subject_name, staffName: cell.staff_name, room: cell.room } : null}
                    defaultTimes={data.cells.find((c) => c.period_no === period) ? { start: data.cells.find((c) => c.period_no === period)!.start_time.slice(0, 5), end: data.cells.find((c) => c.period_no === period)!.end_time.slice(0, 5) } : null}
                    subjects={data.subjects.map((s) => ({ value: s.id, label: s.name }))}
                    staff={data.staff.map((s) => ({ value: s.id, label: s.full_name }))}
                  />
                )
              : undefined
          }
        />
      )}
    </>
  );
}
