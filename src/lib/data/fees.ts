import "server-only";
import { z } from "zod";
import { percentageOf, rupeesToPaise } from "../domain/money";
import { pgArray } from "../db";
import type { Sql } from "../db/types";
import { AppError } from "../errors";
import { customFeeInput, discountInput, feeCategoryInput, feeStructureInput } from "../schemas/fees";

export async function listCategories(sql: Sql, schoolId: string) {
  return sql.many<{ id: string; name: string; description: string | null; is_active: boolean }>(
    "select id, name, description, is_active from fee_categories where school_id = $1 order by name",
    [schoolId],
  );
}

export async function createCategory(sql: Sql, schoolId: string, input: z.output<typeof feeCategoryInput>) {
  await sql.exec("insert into fee_categories (school_id, name, description) values ($1, $2, $3)", [schoolId, input.name, input.description]);
}

export type StructureRow = {
  id: string;
  class_id: string;
  class_name: string;
  category: string;
  fee_category_id: string;
  total_amount_paise: number;
  installments: { id: string; no: number; label: string; due_date: string; amount_paise: number }[];
  assigned_students: number;
};

export async function listStructures(sql: Sql, schoolId: string, yearId: string): Promise<StructureRow[]> {
  return sql.many<StructureRow>(
    `select fs.id, fs.class_id, c.name as class_name, fc.name as category, fs.fee_category_id, fs.total_amount_paise,
            coalesce((select json_agg(json_build_object('id', i.id, 'no', i.installment_no, 'label', i.label, 'due_date', i.due_date, 'amount_paise', i.amount_paise) order by i.installment_no)
                      from fee_installments i where i.fee_structure_id = fs.id), '[]'::json) as installments,
            (select count(distinct sfa.student_id)::int from student_fee_assignments sfa join fee_installments i on i.id = sfa.fee_installment_id
              where i.fee_structure_id = fs.id and sfa.status = 'active') as assigned_students
     from fee_structures fs join classes c on c.id = fs.class_id join fee_categories fc on fc.id = fs.fee_category_id
     where fs.school_id = $1 and fs.academic_year_id = $2 order by c.grade_level, fc.name`,
    [schoolId, yearId],
  );
}

/** Creates the structure for each selected class and (optionally) the per-student fee lines. */
export async function createStructures(sql: Sql, schoolId: string, yearId: string, userId: string, input: z.output<typeof feeStructureInput>) {
  let lines = 0;
  for (const classId of input.classIds) {
    const st = await sql.one<{ id: string }>(
      `insert into fee_structures (school_id, academic_year_id, class_id, fee_category_id, total_amount_paise) values ($1, $2, $3, $4, $5) returning id`,
      [schoolId, yearId, classId, input.feeCategoryId, input.total],
    );
    for (const [i, inst] of input.installments.entries()) {
      await sql.exec(
        "insert into fee_installments (school_id, fee_structure_id, installment_no, label, due_date, amount_paise) values ($1, $2, $3, $4, $5, $6)",
        [schoolId, st.id, i + 1, inst.label, inst.dueDate, inst.amount],
      );
    }
    if (input.assignToStudents) lines += await assignStructureToClass(sql, schoolId, userId, st.id);
  }
  return lines;
}

/** Adds this structure's installments to every active student of the class who does not have them yet. */
export async function assignStructureToClass(sql: Sql, schoolId: string, userId: string, structureId: string) {
  const rows = await sql.many(
    `insert into student_fee_assignments (school_id, student_id, academic_year_id, fee_category_id, fee_installment_id, description, due_date, amount_paise, created_by)
     select fs.school_id, e.student_id, fs.academic_year_id, fs.fee_category_id, i.id, fc.name || ' – ' || i.label, i.due_date, i.amount_paise, $3
     from fee_structures fs
     join fee_installments i on i.fee_structure_id = fs.id
     join fee_categories fc on fc.id = fs.fee_category_id
     join sections sec on sec.class_id = fs.class_id and sec.academic_year_id = fs.academic_year_id
     join enrollments e on e.section_id = sec.id and e.status = 'active'
     where fs.id = $1 and fs.school_id = $2
     on conflict (student_id, fee_installment_id) do nothing
     returning id`,
    [structureId, schoolId, userId],
  );
  return rows.length;
}

export async function addCustomFee(sql: Sql, schoolId: string, userId: string, yearId: string, input: z.output<typeof customFeeInput>) {
  await sql.exec(
    `insert into student_fee_assignments (school_id, student_id, academic_year_id, fee_category_id, description, due_date, amount_paise, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [schoolId, input.studentId, yearId, input.feeCategoryId, input.description, input.dueDate, input.amount, userId],
  );
}

/** Discount stored as absolute paise (percentages rounded half-up to the paisa at the time it is granted). */
export async function applyDiscount(sql: Sql, schoolId: string, input: z.output<typeof discountInput>) {
  const line = await sql.one<{ amount_paise: number; student_id: string }>(
    "select amount_paise, student_id from student_fee_assignments where id = $1 and school_id = $2 for update",
    [input.lineId, schoolId],
  );
  let discount: number;
  if (input.mode === "percent") {
    const pct = Number(input.value);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new AppError("Enter a percentage between 0 and 100");
    discount = percentageOf(line.amount_paise, pct);
  } else {
    discount = rupeesToPaise(input.value);
  }
  if (discount > line.amount_paise) throw new AppError("The discount cannot exceed the fee amount");
  await sql.exec(
    "update student_fee_assignments set discount_paise = $2, discount_type = $3, discount_reason = $4 where id = $1",
    [input.lineId, discount, discount ? input.discountType : null, discount ? input.reason : null],
  );
  return { studentId: line.student_id, discount };
}

export async function cancelFeeLine(sql: Sql, schoolId: string, lineId: string) {
  const paid = await sql.one<{ paid: number }>("select paid_paise as paid from student_fee_balances where id = $1", [lineId]);
  if (paid.paid > 0) throw new AppError("This fee has payments against it. Void the payments first.");
  const rows = await sql.many<{ student_id: string }>(
    "update student_fee_assignments set status = 'cancelled' where id = $1 and school_id = $2 returning student_id",
    [lineId, schoolId],
  );
  if (!rows.length) throw new AppError("Fee item not found", "not_found");
  return rows[0].student_id;
}

export type BalanceLine = {
  id: string;
  description: string;
  due_date: string;
  amount_paise: number;
  discount_paise: number;
  discount_type: string | null;
  discount_reason: string | null;
  net_paise: number;
  paid_paise: number;
  balance_paise: number;
  category: string;
};

export async function studentLines(sql: Sql, studentId: string, yearId?: string): Promise<BalanceLine[]> {
  return sql.many<BalanceLine>(
    `select b.id, b.description, b.due_date, b.amount_paise, b.discount_paise, b.discount_type, b.discount_reason, b.net_paise, b.paid_paise, b.balance_paise,
            fc.name as category
     from student_fee_balances b join fee_categories fc on fc.id = b.fee_category_id
     where b.student_id = $1 and ($2::uuid is null or b.academic_year_id = $2)
     order by b.due_date, b.description`,
    [studentId, yearId ?? null],
  );
}

export type PaymentRow = {
  id: string;
  receipt_no: string;
  student_id: string;
  student_name: string;
  admission_no: string;
  section_label: string | null;
  amount_paise: number;
  method: string;
  mode: string;
  status: string;
  reference_no: string | null;
  paid_at: string;
  recorded_by_name: string | null;
  void_reason: string | null;
};

export async function listPayments(sql: Sql, schoolId: string, filter: { from: string; to: string; studentId?: string }): Promise<PaymentRow[]> {
  return sql.many<PaymentRow>(
    `select p.id, p.receipt_no, p.student_id, trim(s.first_name || ' ' || s.last_name) as student_name, s.admission_no,
            c.name || ' ' || sec.name as section_label, p.amount_paise, p.method, p.mode, p.status, p.reference_no, p.paid_at,
            up.full_name as recorded_by_name, p.void_reason
     from payments p join students s on s.id = p.student_id
     left join enrollments e on e.student_id = s.id and e.status = 'active'
     left join sections sec on sec.id = e.section_id left join classes c on c.id = sec.class_id
     left join user_profiles up on up.id = p.recorded_by
     where p.school_id = $1 and (p.paid_at at time zone 'Asia/Kolkata')::date between $2 and $3
       and ($4::uuid is null or p.student_id = $4)
     order by p.paid_at desc`,
    [schoolId, filter.from, filter.to, filter.studentId ?? null],
  );
}

export type DuesRow = {
  student_id: string;
  student_name: string;
  admission_no: string;
  section_id: string | null;
  section_label: string | null;
  grade_level: number | null;
  net_paise: number;
  paid_paise: number;
  balance_paise: number;
  overdue_paise: number;
  oldest_due: string | null;
  guardian_phone: string | null;
};

export async function duesByStudent(sql: Sql, schoolId: string, yearId: string, today: string): Promise<DuesRow[]> {
  return sql.many<DuesRow>(
    `select s.id as student_id, trim(s.first_name || ' ' || s.last_name) as student_name, s.admission_no,
            e.section_id, c.name || ' ' || sec.name as section_label, c.grade_level,
            sum(b.net_paise)::bigint as net_paise, sum(b.paid_paise)::bigint as paid_paise, sum(b.balance_paise)::bigint as balance_paise,
            coalesce(sum(b.balance_paise) filter (where b.due_date < $3), 0)::bigint as overdue_paise,
            min(b.due_date) filter (where b.balance_paise > 0 and b.due_date < $3) as oldest_due,
            (select g.phone from student_guardians sg join guardians g on g.id = sg.guardian_id where sg.student_id = s.id order by sg.is_primary desc limit 1) as guardian_phone
     from student_fee_balances b join students s on s.id = b.student_id
     left join enrollments e on e.student_id = s.id and e.academic_year_id = $2
     left join sections sec on sec.id = e.section_id left join classes c on c.id = sec.class_id
     where b.school_id = $1 and b.academic_year_id = $2
     group by s.id, s.first_name, s.last_name, s.admission_no, e.section_id, c.name, sec.name, c.grade_level
     order by overdue_paise desc, s.first_name`,
    [schoolId, yearId, today],
  );
}

export async function getPaymentForReceipt(sql: Sql, paymentId: string) {
  const payment = await sql.maybeOne<
    PaymentRow & { school_id: string; notes: string | null; provider: string | null; provider_payment_id: string | null; voided_at: string | null; year: string }
  >(
    `select p.id, p.school_id, p.receipt_no, p.student_id, trim(s.first_name || ' ' || s.last_name) as student_name, s.admission_no,
            c.name || ' ' || sec.name as section_label, p.amount_paise, p.method, p.mode, p.status, p.reference_no, p.paid_at,
            up.full_name as recorded_by_name, p.void_reason, p.notes, p.provider, p.provider_payment_id, p.voided_at, y.name as year
     from payments p join students s on s.id = p.student_id join academic_years y on y.id = p.academic_year_id
     left join enrollments e on e.student_id = s.id and e.academic_year_id = p.academic_year_id
     left join sections sec on sec.id = e.section_id left join classes c on c.id = sec.class_id
     left join user_profiles up on up.id = p.recorded_by
     where p.id = $1`,
    [paymentId],
  );
  if (!payment) return null;
  const allocations = await sql.many<{ description: string; amount_paise: number; balance_paise: number }>(
    `select f.description, a.amount_paise, b.balance_paise from payment_allocations a
     join student_fee_assignments f on f.id = a.student_fee_assignment_id
     left join student_fee_balances b on b.id = f.id
     where a.payment_id = $1 order by f.due_date`,
    [paymentId],
  );
  return { payment, allocations };
}

export async function voidPayment(sql: Sql, schoolId: string, userId: string, paymentId: string, reason: string) {
  const p = await sql.maybeOne<{ mode: string; status: string }>("select mode, status from payments where id = $1 and school_id = $2", [paymentId, schoolId]);
  if (!p) throw new AppError("Payment not found", "not_found");
  if (p.status !== "captured") throw new AppError("Only captured payments can be voided.");
  if (p.mode === "gateway") throw new AppError("Online payments must be refunded through the payment gateway, not voided here.");
  await sql.exec(
    "update payments set status = 'voided', voided_at = now(), voided_by = $2, void_reason = $3 where id = $1",
    [paymentId, userId, reason],
  );
}

export async function collectionSummary(sql: Sql, schoolId: string, from: string, to: string) {
  const byMethod = await sql.many<{ method: string; mode: string; count: number; total: number }>(
    `select method, mode, count(*)::int as count, sum(amount_paise)::bigint as total from payments
     where school_id = $1 and status = 'captured' and (paid_at at time zone 'Asia/Kolkata')::date between $2 and $3
     group by method, mode order by total desc`,
    [schoolId, from, to],
  );
  const byCategory = await sql.many<{ category: string; total: number }>(
    `select fc.name as category, sum(a.amount_paise)::bigint as total
     from payment_allocations a join payments p on p.id = a.payment_id and p.status = 'captured'
     join student_fee_assignments f on f.id = a.student_fee_assignment_id join fee_categories fc on fc.id = f.fee_category_id
     where p.school_id = $1 and (p.paid_at at time zone 'Asia/Kolkata')::date between $2 and $3
     group by fc.name order by total desc`,
    [schoolId, from, to],
  );
  const byDay = await sql.many<{ day: string; total: number }>(
    `select (paid_at at time zone 'Asia/Kolkata')::date::text as day, sum(amount_paise)::bigint as total from payments
     where school_id = $1 and status = 'captured' and (paid_at at time zone 'Asia/Kolkata')::date between $2 and $3
     group by 1 order by 1`,
    [schoolId, from, to],
  );
  const byClass = await sql.many<{ label: string; net: number; paid: number; balance: number }>(
    `select c.name as label, sum(b.net_paise)::bigint as net, sum(b.paid_paise)::bigint as paid, sum(b.balance_paise)::bigint as balance
     from student_fee_balances b join enrollments e on e.student_id = b.student_id and e.academic_year_id = b.academic_year_id
     join sections sec on sec.id = e.section_id join classes c on c.id = sec.class_id
     where b.school_id = $1 group by c.name, c.grade_level order by c.grade_level`,
    [schoolId],
  );
  return { byMethod, byCategory, byDay, byClass };
}

export async function reconciliation(sql: Sql, schoolId: string) {
  const orders = await sql.many<{ id: string; provider: string; provider_order_id: string; amount_paise: number; status: string; created_at: string; student_name: string; receipt_no: string | null }>(
    `select o.id, o.provider, o.provider_order_id, o.amount_paise, o.status, o.created_at, trim(s.first_name || ' ' || s.last_name) as student_name, p.receipt_no
     from payment_orders o join students s on s.id = o.student_id left join payments p on p.id = o.payment_id
     where o.school_id = $1 order by o.created_at desc limit 200`,
    [schoolId],
  );
  const webhooks = await sql.many<{ id: string; event_type: string; received_at: string; processed_at: string | null; processing_error: string | null }>(
    "select id, event_type, received_at, processed_at, processing_error from payment_webhook_events where school_id = $1 order by received_at desc limit 50",
    [schoolId],
  );
  return { orders, webhooks };
}

export async function overdueStudentIds(sql: Sql, schoolId: string, today: string, studentIds?: string[]) {
  return (
    await sql.many<{ student_id: string; overdue: number }>(
      `select student_id, sum(balance_paise)::bigint as overdue from student_fee_balances
       where school_id = $1 and balance_paise > 0 and due_date < $2 and ($3::uuid[] is null or student_id = any($3::uuid[]))
       group by student_id`,
      [schoolId, today, studentIds ? pgArray(studentIds) : null],
    )
  );
}
