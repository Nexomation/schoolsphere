import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EMAILS, openTestDb, type TestDb } from "../helpers/fixture";

/**
 * These tests run real SQL against the migrated schema with RLS enforced, as
 * the signed-in user, exactly the way the application does.
 */
let t: TestDb;
let svm: string;
let gvp: string;

beforeAll(async () => {
  t = await openTestDb();
  const schools = await t.service((sql) => sql.many<{ id: string; slug: string }>("select id, slug from schools"));
  svm = schools.find((s) => s.slug === "sri-vidya-mandir")!.id;
  gvp = schools.find((s) => s.slug === "green-valley")!.id;
});
afterAll(() => t.close());

const count = (rows: unknown[]) => rows.length;

describe("tenant isolation between School A (SVM) and School B (GVP)", () => {
  const tables = [
    "students",
    "guardians",
    "staff",
    "attendance_records",
    "assignments",
    "marks",
    "payments",
    "student_fee_assignments",
    "transport_routes",
    "announcements",
    "audit_logs",
  ];

  it.each(tables)("School A admin sees no School B rows in %s", async (table) => {
    const rows = await t.as(EMAILS.svm.admin, (sql) => sql.many(`select id from public.${table} where school_id = $1`, [gvp]));
    expect(count(rows)).toBe(0);
  });

  it("School A admin does see their own school's rows", async () => {
    const rows = await t.as(EMAILS.svm.admin, (sql) => sql.many("select id from students where school_id = $1", [svm]));
    expect(rows.length).toBe(32);
  });

  it("a direct lookup of a School B student by id returns nothing (no IDOR)", async () => {
    const victim = await t.service((sql) => sql.one<{ id: string }>("select id from students where school_id = $1 limit 1", [gvp]));
    const row = await t.as(EMAILS.svm.admin, (sql) => sql.maybeOne("select * from students where id = $1", [victim.id]));
    expect(row).toBeNull();
  });

  it("School A admin cannot insert a student into School B", async () => {
    await expect(
      t.as(EMAILS.svm.admin, (sql) =>
        sql.exec(
          `insert into students (school_id, admission_no, first_name, date_of_birth, gender)
           values ($1, 'HACK1', 'Intruder', '2014-01-01', 'male')`,
          [gvp],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("School A admin cannot update or delete School B records (0 rows affected)", async () => {
    const updated = await t.as(EMAILS.svm.admin, (sql) =>
      sql.many("update students set first_name = 'Changed' where school_id = $1 returning id", [gvp]),
    );
    expect(updated).toHaveLength(0);
    const deleted = await t.as(EMAILS.svm.admin, (sql) =>
      sql.many("delete from announcements where school_id = $1 returning id", [gvp]),
    );
    expect(deleted).toHaveLength(0);
  });

  it("composite foreign keys stop cross-school links even in the trusted context", async () => {
    const student = await t.service((sql) => sql.one<{ id: string }>("select id from students where school_id = $1 limit 1", [svm]));
    const section = await t.service((sql) => sql.one<{ id: string; academic_year_id: string }>("select id, academic_year_id from sections where school_id = $1 limit 1", [gvp]));
    await expect(
      t.service((sql) =>
        sql.exec(
          "insert into enrollments (school_id, student_id, section_id, academic_year_id) values ($1, $2, $3, $4)",
          [svm, student.id, section.id, section.academic_year_id],
        ),
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("platform admin can list schools but not children's records", async () => {
    const schools = await t.as(EMAILS.platform, (sql) => sql.many("select id from schools"));
    expect(schools.length).toBe(2);
    const students = await t.as(EMAILS.platform, (sql) => sql.many("select id from students"));
    expect(students).toHaveLength(0);
    const marks = await t.as(EMAILS.platform, (sql) => sql.many("select id from marks"));
    expect(marks).toHaveLength(0);
  });

  it("anonymous role has no table access at all", async () => {
    await expect(
      t.service(async (sql) => {
        await sql.exec("set local role anon");
        return sql.many("select id from students");
      }),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

describe("parents and students", () => {
  it("a parent sees only their verified children", async () => {
    const rows = await t.as(EMAILS.svm.parent, (sql) =>
      sql.many<{ first_name: string }>("select first_name from students order by first_name"),
    );
    expect(rows.map((r) => r.first_name)).toEqual(["Aadhya", "Kavin"]);
  });

  it("an unverified guardian link grants no access", async () => {
    const rows = await t.as(EMAILS.svm.parent2, (sql) => sql.many("select id from students"));
    expect(rows).toHaveLength(0);
  });

  it("a parent cannot read other children's attendance, fees or payments", async () => {
    const own = await t.as(EMAILS.svm.parent, (sql) => sql.many<{ student_id: string }>("select distinct student_id from attendance_records"));
    expect(own).toHaveLength(2);
    const fees = await t.as(EMAILS.svm.parent, (sql) => sql.many<{ student_id: string }>("select distinct student_id from student_fee_assignments"));
    expect(fees).toHaveLength(2);
    const pays = await t.as(EMAILS.svm.parent, (sql) => sql.many<{ student_id: string }>("select distinct student_id from payments"));
    expect(pays.length).toBeLessThanOrEqual(2);
  });

  it("marks are visible to families only after the exam is published", async () => {
    const rows = await t.as(EMAILS.svm.parent, (sql) =>
      sql.many<{ name: string; n: number }>(
        `select ex.name, count(*)::int as n from marks m
         join examination_subjects es on es.id = m.examination_subject_id
         join examinations ex on ex.id = es.examination_id
         group by ex.name`,
      ),
    );
    expect(rows.map((r) => r.name)).toEqual(["Quarterly Examination"]);
  });

  it("a student sees only their own record", async () => {
    const rows = await t.as(EMAILS.svm.student, (sql) => sql.many<{ first_name: string }>("select first_name from students"));
    expect(rows.map((r) => r.first_name)).toEqual(["Aadhya"]);
  });

  it("a parent cannot read another user's notifications", async () => {
    const teacherId = await t.userId(EMAILS.svm.teacher1);
    const rows = await t.as(EMAILS.svm.parent, (sql) => sql.many("select id from notifications where user_id = $1", [teacherId]));
    expect(rows).toHaveLength(0);
  });

  it("a parent cannot record a payment", async () => {
    const student = await t.as(EMAILS.svm.parent, (sql) => sql.one<{ id: string }>("select id from students where first_name = 'Aadhya'"));
    const year = await t.service((sql) => sql.one<{ id: string }>("select id from academic_years where school_id = $1", [svm]));
    const parentId = await t.userId(EMAILS.svm.parent);
    await expect(
      t.as(EMAILS.svm.parent, (sql) =>
        sql.exec(
          `insert into payments (school_id, student_id, academic_year_id, receipt_no, amount_paise, method, mode, recorded_by, idempotency_key)
           values ($1, $2, $3, 'FAKE/1', 100, 'cash', 'offline', $4, 'k1')`,
          [svm, student.id, year.id, parentId],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

describe("teachers", () => {
  it("a teacher in School B sees only School B students", async () => {
    const rows = await t.as(EMAILS.gvp.teacher1, (sql) => sql.many<{ school_id: string }>("select school_id from students"));
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.school_id))).toEqual(new Set([gvp]));
  });

  it("a teacher cannot mark attendance for a section they do not teach", async () => {
    // Create a section with no assignments for teacher1 and enroll a student there.
    const setup = await t.service(async (sql) => {
      const cls = await sql.one<{ id: string; academic_year_id: string }>(
        `select c.id, y.id as academic_year_id from classes c join academic_years y on y.school_id = c.school_id
         where c.school_id = $1 and c.name = 'Class 7'`,
        [svm],
      );
      const sec = await sql.one<{ id: string }>(
        "insert into sections (school_id, class_id, academic_year_id, name) values ($1, $2, $3, 'Z') returning id",
        [svm, cls.id, cls.academic_year_id],
      );
      const st = await sql.one<{ id: string }>(
        `insert into students (school_id, admission_no, first_name, date_of_birth, gender) values ($1, 'ZZ1', 'Zed', '2014-05-05', 'male') returning id`,
        [svm],
      );
      await sql.exec("insert into enrollments (school_id, student_id, section_id, academic_year_id) values ($1, $2, $3, $4)", [
        svm,
        st.id,
        sec.id,
        cls.academic_year_id,
      ]);
      return { sectionId: sec.id, studentId: st.id };
    });
    const teacherId = await t.userId(EMAILS.svm.teacher1);
    await expect(
      t.as(EMAILS.svm.teacher1, (sql) =>
        sql.exec(
          `insert into attendance_records (school_id, student_id, section_id, attendance_date, status, marked_by)
           values ($1, $2, $3, '2026-10-23', 'present', $4)`,
          [svm, setup.studentId, setup.sectionId, teacherId],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    // ...and cannot even see that student.
    const seen = await t.as(EMAILS.svm.teacher1, (sql) => sql.many("select id from students where id = $1", [setup.studentId]));
    expect(seen).toHaveLength(0);
  });

  it("a teacher cannot impersonate another marker", async () => {
    const row = await t.as(EMAILS.svm.teacher1, (sql) =>
      sql.one<{ id: string; school_id: string; section_id: string; student_id: string }>(
        "select id, school_id, section_id, student_id from attendance_records where attendance_date = '2026-10-21' limit 1",
      ),
    );
    const adminId = await t.userId(EMAILS.svm.admin);
    await expect(
      t.as(EMAILS.svm.teacher1, (sql) => sql.exec("update attendance_records set status = 'absent', marked_by = $2 where id = $1", [row.id, adminId])),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("teachers cannot change marks once an exam is published, admins can (audited)", async () => {
    const mark = await t.service((sql) =>
      sql.one<{ id: string }>(
        `select m.id from marks m join examination_subjects es on es.id = m.examination_subject_id
         join examinations ex on ex.id = es.examination_id join subjects s on s.id = es.subject_id
         where ex.school_id = $1 and ex.status = 'published' and s.code = 'MAT' and not m.is_absent limit 1`,
        [svm],
      ),
    );
    const teacherId = await t.userId(EMAILS.svm.teacher1);
    const changed = await t.as(EMAILS.svm.teacher1, (sql) =>
      sql.many("update marks set marks_obtained = 99, entered_by = $2 where id = $1 returning id", [mark.id, teacherId]),
    );
    expect(changed).toHaveLength(0);

    const adminId = await t.userId(EMAILS.svm.admin);
    await t.db.transaction(async (sql) => {
      await sql.exec("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: adminId })]);
      await sql.exec("select set_config('app.change_reason', 'Re-totalled answer script', true)");
      await sql.exec("set local role authenticated");
      await sql.exec("update marks set marks_obtained = 77, entered_by = $2 where id = $1", [mark.id, adminId]);
    });
    const log = await t.service((sql) =>
      sql.one<{ actor_user_id: string; reason: string; old_data: { marks_obtained: number }; new_data: { marks_obtained: number } }>(
        "select actor_user_id, reason, old_data, new_data from audit_logs where entity_type = 'marks' and entity_id = $1 and action = 'update'",
        [mark.id],
      ),
    );
    expect(log.actor_user_id).toBe(adminId);
    expect(log.reason).toBe("Re-totalled answer script");
    expect(log.new_data.marks_obtained).toBe(77);
  });
});

describe("transport roles", () => {
  it("a driver has no direct access to student records", async () => {
    const rows = await t.as(EMAILS.svm.driver1, (sql) => sql.many("select id from students"));
    expect(rows).toHaveLength(0);
    const guardians = await t.as(EMAILS.svm.driver1, (sql) => sql.many("select id from guardians"));
    expect(guardians).toHaveLength(0);
  });

  it("a driver gets the manifest for their own route only", async () => {
    const driverId = await t.userId(EMAILS.svm.driver1);
    const routes = await t.service((sql) =>
      sql.many<{ id: string; code: string }>("select id, code from transport_routes where school_id = $1 order by code", [svm]),
    );
    const trip = await t.as(EMAILS.svm.driver1, (sql) =>
      sql.one<{ id: string }>(
        `insert into transport_trips (school_id, route_id, trip_type, trip_date, started_by) values ($1, $2, 'pickup', '2026-10-22', $3) returning id`,
        [svm, routes[0].id, driverId],
      ),
    );
    const manifest = await t.as(EMAILS.svm.driver1, (sql) => sql.many("select * from get_trip_manifest($1)", [trip.id]));
    expect(manifest.length).toBeGreaterThan(0);

    // Route 2 belongs to driver2: driver1 can neither start it nor read its manifest.
    await expect(
      t.as(EMAILS.svm.driver1, (sql) =>
        sql.exec(`insert into transport_trips (school_id, route_id, trip_type, trip_date, started_by) values ($1, $2, 'pickup', '2026-10-22', $3)`, [
          svm,
          routes[1].id,
          driverId,
        ]),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    const otherTrip = await t.service((sql) =>
      sql.one<{ id: string }>(
        `insert into transport_trips (school_id, route_id, trip_type, trip_date) values ($1, $2, 'pickup', '2026-10-22') returning id`,
        [svm, routes[1].id],
      ),
    );
    await expect(t.as(EMAILS.svm.driver1, (sql) => sql.many("select * from get_trip_manifest($1)", [otherTrip.id]))).rejects.toMatchObject({
      code: "42501",
    });
  });

  it("a driver cannot inject simulated locations, and parents only see live trips on their child's route", async () => {
    const trip = await t.service((sql) =>
      sql.one<{ id: string; school_id: string; vehicle_id: string }>(
        "select id, school_id, vehicle_id from transport_trips where status = 'in_progress' and school_id = $1 order by started_at limit 1",
        [svm],
      ),
    );
    await expect(
      t.as(EMAILS.svm.driver1, (sql) =>
        sql.exec(
          `insert into vehicle_location_events (school_id, trip_id, latitude, longitude, source, recorded_at)
           values ($1, $2, 11.01, 76.95, 'simulator', now())`,
          [svm, trip.id],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    const parentRows = await t.as(EMAILS.gvp.parent, (sql) => sql.many("select id from transport_trips"));
    expect(parentRows).toHaveLength(0);
  });
});

describe("ledger and audit integrity", () => {
  it("audit logs cannot be modified or deleted, even by the trusted service context", async () => {
    await expect(t.service((sql) => sql.exec("update audit_logs set action = 'tampered' where id = 1"))).rejects.toThrow(/append-only/);
    await expect(t.service((sql) => sql.exec("delete from audit_logs where id = 1"))).rejects.toThrow(/append-only/);
    await expect(t.as(EMAILS.svm.admin, (sql) => sql.exec("delete from audit_logs"))).rejects.toMatchObject({ code: "42501" });
  });

  it("payments are immutable apart from voiding", async () => {
    const p = await t.service((sql) => sql.one<{ id: string }>("select id from payments where school_id = $1 limit 1", [svm]));
    await expect(
      t.as(EMAILS.svm.accounts, (sql) => sql.exec("update payments set amount_paise = 1 where id = $1", [p.id])),
    ).rejects.toThrow(/immutable/);
    // There is no DELETE policy, so RLS silently matches nothing...
    const deleted = await t.as(EMAILS.svm.accounts, (sql) => sql.many("delete from payments where id = $1 returning id", [p.id]));
    expect(deleted).toHaveLength(0);
    // ...and the guard trigger blocks deletion even for the trusted context.
    await expect(t.service((sql) => sql.exec("delete from payments where id = $1", [p.id]))).rejects.toThrow(/cannot be deleted/);
  });

  it("staff cannot create gateway payments directly (only verified server flows can)", async () => {
    const accId = await t.userId(EMAILS.svm.accounts);
    const s = await t.service((sql) =>
      sql.one<{ student_id: string; academic_year_id: string }>(
        "select student_id, academic_year_id from student_fee_assignments where school_id = $1 limit 1",
        [svm],
      ),
    );
    await expect(
      t.as(EMAILS.svm.accounts, (sql) =>
        sql.exec(
          `insert into payments (school_id, student_id, academic_year_id, receipt_no, amount_paise, method, mode, provider, provider_payment_id, recorded_by, idempotency_key)
           values ($1, $2, $3, 'X/1', 100, 'gateway', 'gateway', 'razorpay', 'pay_fake', $4, 'gw-1')`,
          [svm, s.student_id, s.academic_year_id, accId],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("over-allocating a fee line is rejected at commit", async () => {
    const line = await t.service((sql) =>
      sql.one<{ id: string; student_id: string; academic_year_id: string; net: number }>(
        `select f.id, f.student_id, f.academic_year_id, f.amount_paise - f.discount_paise as net from student_fee_assignments f
         where f.school_id = $1 and f.description like 'Tuition fee – Term 3%' limit 1`,
        [svm],
      ),
    );
    const accId = await t.userId(EMAILS.svm.accounts);
    await expect(
      t.as(EMAILS.svm.accounts, async (sql) => {
        const p = await sql.one<{ id: string }>(
          `insert into payments (school_id, student_id, academic_year_id, receipt_no, amount_paise, method, mode, recorded_by, idempotency_key)
           values ($1, $2, $3, 'OVER/1', $4, 'cash', 'offline', $5, 'over-1') returning id`,
          [svm, line.student_id, line.academic_year_id, line.net + 100, accId],
        );
        await sql.exec(
          "insert into payment_allocations (school_id, payment_id, student_fee_assignment_id, amount_paise) values ($1, $2, $3, $4)",
          [svm, p.id, line.id, line.net + 100],
        );
      }),
    ).rejects.toThrow(/overpaid/);
  });

  it("a payment whose allocations do not add up is rejected at commit", async () => {
    const line = await t.service((sql) =>
      sql.one<{ id: string; student_id: string; academic_year_id: string }>(
        `select f.id, f.student_id, f.academic_year_id from student_fee_assignments f
         where f.school_id = $1 and f.description like 'Tuition fee – Term 3%' limit 1`,
        [svm],
      ),
    );
    const accId = await t.userId(EMAILS.svm.accounts);
    await expect(
      t.as(EMAILS.svm.accounts, async (sql) => {
        const p = await sql.one<{ id: string }>(
          `insert into payments (school_id, student_id, academic_year_id, receipt_no, amount_paise, method, mode, recorded_by, idempotency_key)
           values ($1, $2, $3, 'MISMATCH/1', 50000, 'cash', 'offline', $4, 'mismatch-1') returning id`,
          [svm, line.student_id, line.academic_year_id, accId],
        );
        await sql.exec(
          "insert into payment_allocations (school_id, payment_id, student_fee_assignment_id, amount_paise) values ($1, $2, $3, 100)",
          [svm, p.id, line.id],
        );
      }),
    ).rejects.toThrow(/allocates/);
  });
});
