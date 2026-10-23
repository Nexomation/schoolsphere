import type { Metadata } from "next";
import { ConfirmAction } from "@/components/confirm-action";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageContext } from "@/lib/auth/context";
import { listClasses } from "@/lib/data/academics";
import { listCategories, listStructures } from "@/lib/data/fees";
import { currentYear } from "@/lib/data/school";
import { formatDate } from "@/lib/domain/dates";
import { formatINR } from "@/lib/domain/money";
import { assignStructureAction } from "../actions";
import { CategoryForm, StructureForm } from "./structure-form";

export const metadata: Metadata = { title: "Fee setup" };

export default async function FeeSetupPage() {
  const ctx = await requirePageContext("fees.manage");
  const d = await ctx.db(async (sql) => {
    const year = await currentYear(sql, ctx.schoolId);
    return { year, categories: await listCategories(sql, ctx.schoolId), structures: await listStructures(sql, ctx.schoolId, year.id), classes: await listClasses(sql, ctx.schoolId) };
  });
  return (
    <>
      <PageHeader title="Fee setup" description={`Fee structures for ${d.year.name}. Amounts are in rupees; installments must add up to the total.`} />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="grid content-start gap-6 lg:col-span-3">
          {d.structures.length === 0 && <p className="text-sm text-muted-foreground">No fee structures yet.</p>}
          {d.structures.map((s) => (
            <Card key={s.id} className="gap-3 py-4">
              <CardHeader className="flex-row items-start justify-between gap-3 px-4">
                <div>
                  <CardTitle className="text-base">
                    {s.class_name} · {s.category}
                  </CardTitle>
                  <CardDescription>
                    {formatINR(s.total_amount_paise, { whole: true })} per year · {s.assigned_students} students billed
                  </CardDescription>
                </div>
                <ConfirmAction
                  action={assignStructureAction.bind(null, s.id)}
                  title="Bill students who are not yet billed?"
                  description={`Creates ${s.category.toLowerCase()} items for every active student in ${s.class_name} who does not have them yet (for example new admissions). Existing items are not changed.`}
                  confirmLabel="Bill students"
                  triggerLabel="Bill new admissions"
                />
              </CardHeader>
              <CardContent className="px-4">
                <ul className="grid gap-1 text-sm sm:grid-cols-3">
                  {s.installments.map((i) => (
                    <li key={i.id} className="rounded-md border px-2 py-1">
                      <span className="font-medium">{i.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {formatINR(i.amount_paise, { whole: true })} · due {formatDate(i.due_date)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid content-start gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>New fee structure</CardTitle>
              <CardDescription>Use the same structure for several classes at once.</CardDescription>
            </CardHeader>
            <CardContent>
              <StructureForm classes={d.classes.map((c) => ({ value: c.id, label: c.name }))} categories={d.categories.filter((c) => c.is_active).map((c) => ({ value: c.id, label: c.name }))} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Fee categories</CardTitle>
              <CardDescription>{d.categories.map((c) => c.name).join(", ") || "None yet"}</CardDescription>
            </CardHeader>
            <CardContent>
              <CategoryForm />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
