/**
 * Development and test fixtures: two independent demo schools.
 *
 * Every school created here has is_demo = true and every account uses the
 * reserved `.test` email domain, so nothing can be mistaken for (or delivered
 * to) a real school or family. Never run this against a production database.
 */
import { addDays, eachDate, isoWeekday, todayIn } from "../domain/dates";
import { GRADE_SCALE_PRESETS } from "../domain/grading";
import { holidaySet, DEFAULT_ATTENDANCE_POLICY } from "../domain/attendance";
import type { Sql } from "../db/types";

export type CreateAuthUser = (input: { email: string; fullName: string }) => Promise<string>;

export type SeedSummary = {
  schools: { id: string; name: string; slug: string }[];
  accounts: { email: string; role: string; school: string | null; name: string }[];
};

// Deterministic PRNG so every developer gets identical demo data.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES_GIRLS = ["Aadhya", "Bhavya", "Dharshini", "Harini", "Nila", "Rithika", "Swetha", "Varshini", "Yazhini", "Deepika", "Keerthana", "Janani", "Sowmya", "Pavithra", "Ananya", "Lavanya"];
const FIRST_NAMES_BOYS = ["Arjun", "Kavin", "Madhan", "Pranav", "Sanjay", "Tharun", "Akash", "Gokul", "Mithun", "Surya", "Vishal", "Naveen", "Harish", "Dinesh", "Rohit", "Karthik"];
const FATHER_NAMES = ["Vignesh", "Raman", "Subramanian", "Natarajan", "Srinivasan", "Venkatesh", "Pandian", "Rajendran", "Murugesan", "Balaji", "Senthil", "Elango", "Ganesan", "Jayakumar", "Kannan", "Prakash"];

const HOLIDAYS_2026_27: { title: string; start: string; end: string }[] = [
  { title: "Gandhi Jayanti", start: "2026-10-02", end: "2026-10-02" },
  { title: "Quarterly examination holidays", start: "2026-09-26", end: "2026-10-04" },
  { title: "Ayudha Pooja & Vijayadasami", start: "2026-10-19", end: "2026-10-20" },
  { title: "Deepavali", start: "2026-11-07", end: "2026-11-09" },
  { title: "Pongal holidays", start: "2027-01-14", end: "2027-01-17" },
];

const SUBJECTS = [
  { name: "English", code: "ENG" },
  { name: "Tamil", code: "TAM" },
  { name: "Mathematics", code: "MAT" },
  { name: "Science", code: "SCI" },
  { name: "Social Science", code: "SOC" },
  { name: "Computer Science", code: "CS" },
];

type SchoolPlan = {
  key: "svm" | "gvp";
  name: string;
  slug: string;
  board: string;
  city: string;
  district: string;
  pincode: string;
  phone: string;
  primaryColor: string;
  receiptPrefix: string;
  gradePreset: keyof typeof GRADE_SCALE_PRESETS;
  sections: { className: string; grade: number; section: string }[];
  studentsPerSection: number;
  campus: { lat: number; lng: number };
  routes: { code: string; name: string; stops: { name: string; lat: number; lng: number; pickup: string; drop: string }[] }[];
  seed: number;
};

const PLANS: SchoolPlan[] = [
  {
    key: "svm",
    name: "Sri Vidya Mandir Matriculation Hr. Sec. School",
    slug: "sri-vidya-mandir",
    board: "MATRICULATION",
    city: "Coimbatore",
    district: "Coimbatore",
    pincode: "641018",
    phone: "04224000000",
    primaryColor: "#4f46e5",
    receiptPrefix: "SVM",
    gradePreset: "tn_state_board",
    sections: [
      { className: "Class 6", grade: 6, section: "A" },
      { className: "Class 6", grade: 6, section: "B" },
      { className: "Class 7", grade: 7, section: "A" },
      { className: "Class 8", grade: 8, section: "A" },
    ],
    studentsPerSection: 8,
    campus: { lat: 11.0003, lng: 76.9781 },
    routes: [
      {
        code: "R1",
        name: "Saibaba Colony – Town Hall",
        stops: [
          { name: "Saibaba Colony", lat: 11.027, lng: 76.944, pickup: "07:05", drop: "16:25" },
          { name: "R.S. Puram", lat: 11.009, lng: 76.95, pickup: "07:15", drop: "16:15" },
          { name: "Town Hall", lat: 10.996, lng: 76.961, pickup: "07:25", drop: "16:05" },
          { name: "Ukkadam", lat: 10.989, lng: 76.962, pickup: "07:32", drop: "15:58" },
          { name: "School campus (Race Course)", lat: 11.0003, lng: 76.9781, pickup: "07:45", drop: "15:45" },
        ],
      },
      {
        code: "R2",
        name: "Hope College – Avinashi Road",
        stops: [
          { name: "Hope College", lat: 11.029, lng: 77.022, pickup: "07:00", drop: "16:30" },
          { name: "Peelamedu", lat: 11.025, lng: 77.004, pickup: "07:10", drop: "16:20" },
          { name: "Lakshmi Mills", lat: 11.013, lng: 76.99, pickup: "07:20", drop: "16:10" },
          { name: "School campus (Race Course)", lat: 11.0003, lng: 76.9781, pickup: "07:35", drop: "15:45" },
        ],
      },
    ],
    seed: 2026,
  },
  {
    key: "gvp",
    name: "Green Valley Public School",
    slug: "green-valley",
    board: "CBSE",
    city: "Madurai",
    district: "Madurai",
    pincode: "625020",
    phone: "04524000000",
    primaryColor: "#0f766e",
    receiptPrefix: "GVP",
    gradePreset: "cbse_9_point",
    sections: [
      { className: "Class 6", grade: 6, section: "A" },
      { className: "Class 7", grade: 7, section: "A" },
    ],
    studentsPerSection: 8,
    campus: { lat: 9.9396, lng: 78.1214 },
    routes: [
      {
        code: "G1",
        name: "Anna Nagar – K.K. Nagar",
        stops: [
          { name: "Anna Nagar", lat: 9.9306, lng: 78.1428, pickup: "07:10", drop: "16:20" },
          { name: "K.K. Nagar", lat: 9.9352, lng: 78.1349, pickup: "07:20", drop: "16:10" },
          { name: "Tallakulam", lat: 9.9439, lng: 78.1301, pickup: "07:28", drop: "16:02" },
          { name: "School campus", lat: 9.9396, lng: 78.1214, pickup: "07:40", drop: "15:50" },
        ],
      },
    ],
    seed: 1987,
  },
];

export async function seedDemo(sql: Sql, createAuthUser: CreateAuthUser, opts: { today?: string } = {}): Promise<SeedSummary> {
  const today = opts.today ?? todayIn();
  const summary: SeedSummary = { schools: [], accounts: [] };

  const platformAdmin = await createAuthUser({ email: "platform@schoolsphere.test", fullName: "Platform Administrator" });
  await sql.exec("insert into public.platform_admins (user_id) values ($1)", [platformAdmin]);
  summary.accounts.push({ email: "platform@schoolsphere.test", role: "platform_admin", school: null, name: "Platform Administrator" });

  for (const plan of PLANS) {
    await seedSchool(sql, createAuthUser, plan, today, summary);
  }
  return summary;
}

async function seedSchool(sql: Sql, createAuthUser: CreateAuthUser, plan: SchoolPlan, today: string, summary: SeedSummary) {
  const rand = mulberry32(plan.seed);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const email = (local: string) => `${local}.${plan.key}@schoolsphere.test`;

  const school = await sql.one<{ id: string }>(
    `insert into public.schools (name, slug, board, address_line1, city, district, pincode, phone, email, status, is_demo,
       onboarding_completed_at, branding, settings)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', true, now(), $10::jsonb, $11::jsonb) returning id`,
    [
      plan.name,
      plan.slug,
      plan.board,
      plan.key === "svm" ? "12, Race Course Road" : "4, Alagar Kovil Main Road",
      plan.city,
      plan.district,
      plan.pincode,
      plan.phone,
      `office.${plan.key}@schoolsphere.test`,
      JSON.stringify({ appName: "SchoolSphere", primaryColor: plan.primaryColor }),
      JSON.stringify({
        attendance: DEFAULT_ATTENDANCE_POLICY,
        receiptPrefix: plan.receiptPrefix,
        absentPolicy: "absent_counts_as_zero",
        attendanceEditWindowDays: 7,
      }),
    ],
  );
  const schoolId = school.id;
  summary.schools.push({ id: schoolId, name: plan.name, slug: plan.slug });

  const account = async (local: string, fullName: string, role: string) => {
    const userId = await createAuthUser({ email: email(local), fullName });
    await sql.exec("insert into public.school_memberships (school_id, user_id, role) values ($1, $2, $3)", [schoolId, userId, role]);
    summary.accounts.push({ email: email(local), role, school: plan.name, name: fullName });
    return userId;
  };

  // ---- Academic year, terms, calendar -------------------------------------
  const year = await sql.one<{ id: string }>(
    `insert into public.academic_years (school_id, name, start_date, end_date, is_current)
     values ($1, '2026-27', '2026-06-01', '2027-04-30', true) returning id`,
    [schoolId],
  );
  const terms: Record<string, string> = {};
  for (const [i, t] of [
    ["Term 1", "2026-06-01", "2026-09-30"],
    ["Term 2", "2026-10-01", "2026-12-31"],
    ["Term 3", "2027-01-01", "2027-04-30"],
  ].entries()) {
    const row = await sql.one<{ id: string }>(
      `insert into public.terms (school_id, academic_year_id, name, start_date, end_date, sort_order)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [schoolId, year.id, t[0], t[1], t[2], i + 1],
    );
    terms[t[0]] = row.id;
  }
  for (const h of HOLIDAYS_2026_27) {
    await sql.exec(
      `insert into public.calendar_events (school_id, academic_year_id, title, event_type, start_date, end_date)
       values ($1, $2, $3, 'holiday', $4, $5)`,
      [schoolId, year.id, h.title, h.start, h.end],
    );
  }
  for (const e of [
    { title: "Parent–Teacher Meeting", type: "ptm", start: addDays(today, 9), end: addDays(today, 9) },
    { title: "Annual Sports Day", type: "event", start: addDays(today, 24), end: addDays(today, 24) },
    { title: "Unit Test 2", type: "exam", start: addDays(today, 5), end: addDays(today, 8) },
  ]) {
    await sql.exec(
      `insert into public.calendar_events (school_id, academic_year_id, title, event_type, start_date, end_date)
       values ($1, $2, $3, $4, $5, $6)`,
      [schoolId, year.id, e.title, e.type, e.start, e.end],
    );
  }

  // ---- Subjects, classes, sections --------------------------------------------
  const subjectIds: Record<string, string> = {};
  for (const s of SUBJECTS) {
    const row = await sql.one<{ id: string }>(
      "insert into public.subjects (school_id, name, code) values ($1, $2, $3) returning id",
      [schoolId, s.name, s.code],
    );
    subjectIds[s.code] = row.id;
  }

  const classIds: Record<string, string> = {};
  for (const s of plan.sections) {
    if (!classIds[s.className]) {
      const row = await sql.one<{ id: string }>(
        "insert into public.classes (school_id, name, grade_level) values ($1, $2, $3) returning id",
        [schoolId, s.className, s.grade],
      );
      classIds[s.className] = row.id;
    }
  }

  // ---- Staff and accounts ----------------------------------------------------
  const staffIds: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  const addStaff = async (
    key: string,
    fullName: string,
    designation: string,
    staffType: string,
    role: string | null,
  ) => {
    const userId = role ? await account(key, fullName, role) : null;
    if (userId) userIds[key] = userId;
    const row = await sql.one<{ id: string }>(
      `insert into public.staff (school_id, user_id, employee_code, full_name, email, phone, designation, staff_type, date_of_joining)
       values ($1, $2, $3, $4, $5, $6, $7, $8, '2019-06-01') returning id`,
      [
        schoolId,
        userId,
        `${plan.receiptPrefix}-${String(Object.keys(staffIds).length + 1).padStart(3, "0")}`,
        fullName,
        role ? email(key) : null,
        `98${plan.seed % 100}${String(Object.keys(staffIds).length).padStart(6, "0")}`,
        designation,
        staffType,
      ],
    );
    staffIds[key] = row.id;
    return row.id;
  };

  const isA = plan.key === "svm";
  await addStaff("admin", isA ? "Dr. Lakshmi Narayanan" : "Mrs. Fathima Begum", "Principal", "administrative", "school_admin");
  await addStaff("accounts", isA ? "R. Meenakshi" : "S. Arul Doss", "Accountant", "accounts", "accountant");
  if (isA) {
    await addStaff("teacher1", "Karthik Subramanian", "Mathematics Teacher", "teaching", "teacher");
    await addStaff("teacher2", "Priya Raman", "Science Teacher", "teaching", "teacher");
    await addStaff("teacher3", "Anitha Joseph", "Languages Teacher", "teaching", "teacher");
    await addStaff("teacher4", "Senthil Kumar", "Social Science Teacher", "teaching", "teacher");
  } else {
    await addStaff("teacher1", "Deepa Krishnan", "Class Teacher", "teaching", "teacher");
    await addStaff("teacher2", "Mohammed Irfan", "Subject Teacher", "teaching", null);
  }
  await addStaff("transport", isA ? "Ramesh Babu" : "Joseph Antony", "Transport Coordinator", "transport", "transport_coordinator");
  await addStaff("driver1", isA ? "Murugan P." : "Selvaraj K.", "Driver", "transport", "driver");
  if (isA) await addStaff("driver2", "Selvam R.", "Driver", "transport", "driver");
  await addStaff("attendant1", isA ? "Kamala Devi" : "Rani M.", "Bus Attendant", "transport", null);

  const sectionIds: string[] = [];
  const sectionLabel: Record<string, string> = {};
  const classTeacherKeys = isA ? ["teacher1", "teacher2", "teacher3", "teacher4"] : ["teacher1", "teacher2"];
  for (const [i, s] of plan.sections.entries()) {
    const row = await sql.one<{ id: string }>(
      `insert into public.sections (school_id, class_id, academic_year_id, name, class_teacher_id, room, capacity)
       values ($1, $2, $3, $4, $5, $6, 40) returning id`,
      [schoolId, classIds[s.className], year.id, s.section, staffIds[classTeacherKeys[i]], `${s.grade}0${i + 1}`],
    );
    sectionIds.push(row.id);
    sectionLabel[row.id] = `${s.className} ${s.section}`;
  }

  // Subject teaching assignments.
  const subjectTeacher = (code: string) =>
    isA
      ? ({ MAT: "teacher1", SCI: "teacher2", ENG: "teacher3", TAM: "teacher3", SOC: "teacher4", CS: "teacher4" } as Record<string, string>)[code]
      : ({ MAT: "teacher1", SCI: "teacher1", ENG: "teacher1", TAM: "teacher2", SOC: "teacher2", CS: "teacher2" } as Record<string, string>)[code];
  for (const sectionId of sectionIds) {
    for (const s of SUBJECTS) {
      await sql.exec(
        "insert into public.teacher_assignments (school_id, staff_id, section_id, subject_id) values ($1, $2, $3, $4)",
        [schoolId, staffIds[subjectTeacher(s.code)], sectionId, subjectIds[s.code]],
      );
    }
  }

  // Timetable: 6 periods Mon–Sat, greedily avoiding teacher double-booking.
  const periods = [
    ["08:45", "09:30"],
    ["09:30", "10:15"],
    ["10:30", "11:15"],
    ["11:15", "12:00"],
    ["12:45", "13:30"],
    ["13:30", "14:15"],
  ];
  const busy = new Set<string>();
  for (const [k, sectionId] of sectionIds.entries()) {
    for (let day = 1; day <= 6; day++) {
      for (let p = 0; p < periods.length; p++) {
        let chosen: (typeof SUBJECTS)[number] | null = null;
        for (let offset = 0; offset < SUBJECTS.length; offset++) {
          const candidate = SUBJECTS[(p + day + k + offset) % SUBJECTS.length];
          const teacher = subjectTeacher(candidate.code);
          if (!busy.has(`${teacher}:${day}:${p}`)) {
            chosen = candidate;
            busy.add(`${teacher}:${day}:${p}`);
            break;
          }
        }
        if (!chosen) continue;
        await sql.exec(
          `insert into public.timetable_entries (school_id, section_id, day_of_week, period_no, start_time, end_time, subject_id, staff_id)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [schoolId, sectionId, day, p + 1, periods[p][0], periods[p][1], subjectIds[chosen.code], staffIds[subjectTeacher(chosen.code)]],
        );
      }
    }
  }

  // ---- Students, guardians, enrollments ---------------------------------
  type StudentRec = { id: string; sectionId: string; first: string; guardianId: string };
  const students: StudentRec[] = [];
  let admissionSeq = 1;
  let phoneSeq = 0;
  const parentUser = await account("parent", isA ? "Vignesh Raman" : "Abdul Rahman", "parent");
  const parent2User = isA ? await account("parent2", "Sangeetha Prakash", "parent") : null;
  const familyGuardian = await sql.one<{ id: string }>(
    `insert into public.guardians (school_id, user_id, full_name, phone, email, occupation)
     values ($1, $2, $3, $4, $5, 'Software engineer') returning id`,
    [schoolId, parentUser, isA ? "Vignesh Raman" : "Abdul Rahman", `+9190${plan.seed}0000${phoneSeq++}`, email("parent")],
  );

  const addStudent = async (sectionId: string, first: string, last: string, gender: string, rollNo: number) => {
    const dobYear = 2026 - (11 + sectionIds.indexOf(sectionId) % 3);
    const row = await sql.one<{ id: string }>(
      `insert into public.students (school_id, admission_no, first_name, last_name, date_of_birth, gender, blood_group, address, admission_date, emis_no)
       values ($1, $2, $3, $4, $5, $6, $7, $8, '2021-06-07', $9) returning id`,
      [
        schoolId,
        `${plan.receiptPrefix}${String(admissionSeq).padStart(4, "0")}`,
        first,
        last,
        `${dobYear}-${String(1 + Math.floor(rand() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rand() * 27)).padStart(2, "0")}`,
        gender,
        pick(["A+", "B+", "O+", "AB+", "O-", "B-"]),
        `${10 + admissionSeq}, ${pick(["Gandhi Street", "Nehru Nagar", "Kamaraj Road", "Bharathi Nagar"])}, ${plan.city}`,
        `33${plan.seed}${String(admissionSeq).padStart(8, "0")}`,
      ],
    );
    admissionSeq++;
    await sql.exec(
      `insert into public.enrollments (school_id, student_id, section_id, academic_year_id, roll_no, enrolled_on)
       values ($1, $2, $3, $4, $5, '2026-06-01')`,
      [schoolId, row.id, sectionId, year.id, rollNo],
    );
    return row.id;
  };

  for (const [k, sectionId] of sectionIds.entries()) {
    for (let i = 0; i < plan.studentsPerSection; i++) {
      const isFamilyChild = (k === 0 && i === 0) || (isA && k === 3 && i === 0);
      const isParent2Child = isA && k === 2 && i === 0;
      const girl = rand() < 0.5;
      let first = girl ? pick(FIRST_NAMES_GIRLS) : pick(FIRST_NAMES_BOYS);
      let last = pick(FATHER_NAMES);
      if (isFamilyChild) {
        first = k === 0 ? (isA ? "Aadhya" : "Ayesha") : "Kavin";
        last = isA ? "Vignesh" : "Abdul Rahman";
      }
      const gender = isFamilyChild ? (first === "Kavin" ? "male" : "female") : girl ? "female" : "male";
      const studentId = await addStudent(sectionId, first, last, gender, i + 1);

      let guardianId: string;
      if (isFamilyChild) {
        guardianId = familyGuardian.id;
        await sql.exec(
          `insert into public.student_guardians (school_id, student_id, guardian_id, relationship, is_primary, verified_at)
           values ($1, $2, $3, 'father', true, now())`,
          [schoolId, studentId, guardianId],
        );
      } else {
        const g = await sql.one<{ id: string }>(
          `insert into public.guardians (school_id, user_id, full_name, phone, occupation)
           values ($1, $2, $3, $4, $5) returning id`,
          [
            schoolId,
            isParent2Child ? parent2User : null,
            isParent2Child ? "Sangeetha Prakash" : `${last} ${pick(["K.", "S.", "R.", "M."])}`,
            `+9190${plan.seed}${String(1000 + phoneSeq++).padStart(4, "0")}`,
            pick(["Business", "Teacher", "Engineer", "Farmer", "Doctor", "Accountant"]),
          ],
        );
        guardianId = g.id;
        // parent2's link is deliberately NOT verified, to demonstrate the verification step.
        await sql.exec(
          `insert into public.student_guardians (school_id, student_id, guardian_id, relationship, is_primary, verified_at)
           values ($1, $2, $3, $4, true, ${isParent2Child ? "null" : "now()"})`,
          [schoolId, studentId, guardianId, isParent2Child ? "mother" : "father"],
        );
      }
      students.push({ id: studentId, sectionId, first, guardianId });
    }
  }

  // Student login for the family's first child.
  const studentUser = await account("student", isA ? "Aadhya Vignesh" : "Ayesha Abdul Rahman", "student");
  await sql.exec("update public.students set user_id = $1 where id = $2", [studentUser, students[0].id]);

  // ---- Attendance (last ~5 weeks of working days) -------------------------
  const holidays = holidaySet(HOLIDAYS_2026_27, addDays(today, -40), today);
  const markerFor = (sectionId: string) => userIds[classTeacherKeys[sectionIds.indexOf(sectionId)]] ?? userIds.admin;
  const days = eachDate(addDays(today, -35), today).filter(
    (d) => DEFAULT_ATTENDANCE_POLICY.workingWeekdays.includes(isoWeekday(d)) && !holidays.has(d) && d >= "2026-06-01",
  );
  for (const d of days) {
    for (const [k, sectionId] of sectionIds.entries()) {
      // Today, two sections are left unmarked so the dashboard alert is visible.
      if (d === today && k % 2 === 1) continue;
      for (const s of students.filter((x) => x.sectionId === sectionId)) {
        const r = rand();
        const status = r < 0.9 ? "present" : r < 0.94 ? "late" : r < 0.99 ? "absent" : "excused";
        await sql.exec(
          `insert into public.attendance_records (school_id, student_id, section_id, attendance_date, status, marked_by)
           values ($1, $2, $3, $4, $5, $6)`,
          [schoolId, s.id, sectionId, d, status, markerFor(sectionId)],
        );
      }
    }
  }

  // ---- Homework -----------------------------------------------------------
  const homework = [
    { code: "MAT", title: "Fractions practice – Exercise 3.2", due: -9, marks: 20 },
    { code: "SCI", title: "Draw and label the parts of a plant cell", due: -4, marks: 10 },
    { code: "ENG", title: "Write a letter to your friend about Deepavali", due: 2, marks: 10 },
    { code: "SOC", title: "Map work: rivers of Tamil Nadu", due: 6, marks: null },
  ];
  for (const sectionId of sectionIds) {
    for (const h of homework) {
      const teacherKey = subjectTeacher(h.code);
      const due = `${addDays(today, h.due)}T12:30:00.000Z`; // 6 pm IST
      const a = await sql.one<{ id: string }>(
        `insert into public.assignments (school_id, section_id, subject_id, created_by_staff_id, title, description, due_at, max_marks, status, published_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, 'published', $9) returning id`,
        [
          schoolId,
          sectionId,
          subjectIds[h.code],
          staffIds[teacherKey],
          h.title,
          "Complete the work in your notebook and upload a clear photo, or type your answer below.",
          due,
          h.marks,
          `${addDays(today, h.due - 7)}T03:30:00.000Z`,
        ],
      );
      if (h.due < 0) {
        for (const s of students.filter((x) => x.sectionId === sectionId)) {
          if (rand() < 0.8) {
            const graded = h.due <= -9;
            const marks = graded && h.marks ? Math.min(h.marks, Math.round(h.marks * (0.55 + rand() * 0.45))) : null;
            await sql.exec(
              `insert into public.assignment_submissions
                 (school_id, assignment_id, student_id, content, submitted_at, is_late, status, marks_awarded, feedback, graded_by, graded_at)
               values ($1, $2, $3, $4, $5, false, $6, $7, $8, $9, $10)`,
              [
                schoolId,
                a.id,
                s.id,
                "Completed in notebook. Answers attached.",
                `${addDays(today, h.due - 1)}T10:00:00.000Z`,
                graded ? "graded" : "submitted",
                marks,
                graded ? pick(["Good work.", "Neat presentation.", "Revise step 3.", "Well done!"]) : null,
                graded ? userIds[teacherKey] ?? null : null,
                graded ? `${addDays(today, h.due + 2)}T09:00:00.000Z` : null,
              ],
            );
          }
        }
      }
    }
  }

  // ---- Grade scales and examinations -----------------------------------------
  const gradeScaleIds: Record<string, string> = {};
  for (const [key, preset] of Object.entries(GRADE_SCALE_PRESETS)) {
    const row = await sql.one<{ id: string }>(
      "insert into public.grade_scales (school_id, name, bands, is_default) values ($1, $2, $3::jsonb, $4) returning id",
      [schoolId, preset.name, JSON.stringify(preset.bands), key === plan.gradePreset],
    );
    gradeScaleIds[key] = row.id;
  }
  const classesUsed = [...new Set(plan.sections.map((s) => s.className))];
  for (const className of classesUsed) {
    const quarterly = await sql.one<{ id: string }>(
      `insert into public.examinations (school_id, academic_year_id, term_id, class_id, grade_scale_id, name, exam_type, start_date, end_date, status, published_at, published_by)
       values ($1, $2, $3, $4, $5, 'Quarterly Examination', 'term', '2026-09-15', '2026-09-24', 'published', '2026-10-05T05:00:00Z', $6) returning id`,
      [schoolId, year.id, terms["Term 1"], classIds[className], gradeScaleIds[plan.gradePreset], userIds.admin],
    );
    const unitTest = await sql.one<{ id: string }>(
      `insert into public.examinations (school_id, academic_year_id, term_id, class_id, grade_scale_id, name, exam_type, start_date, end_date, status)
       values ($1, $2, $3, $4, $5, 'Unit Test 2', 'unit_test', $6, $7, 'marks_entry') returning id`,
      [schoolId, year.id, terms["Term 2"], classIds[className], gradeScaleIds[plan.gradePreset], addDays(today, -3), addDays(today, -1)],
    );
    const classSections = sectionIds.filter((id) => sectionLabel[id].startsWith(className + " "));
    const classStudents = students.filter((s) => classSections.includes(s.sectionId));
    for (const [i, subj] of SUBJECTS.entries()) {
      const es = await sql.one<{ id: string }>(
        `insert into public.examination_subjects (school_id, examination_id, subject_id, exam_date, max_marks, pass_marks)
         values ($1, $2, $3, $4, 100, 35) returning id`,
        [schoolId, quarterly.id, subjectIds[subj.code], addDays("2026-09-15", i + (i >= 4 ? 2 : 0))],
      );
      for (const s of classStudents) {
        const absent = rand() < 0.02;
        const ability = 0.45 + ((s.first.charCodeAt(0) * 7 + s.first.length * 13) % 50) / 100;
        const marks = absent ? null : Math.max(18, Math.min(100, Math.round(ability * 100 + (rand() - 0.5) * 20)));
        await sql.exec(
          `insert into public.marks (school_id, examination_subject_id, student_id, marks_obtained, is_absent, entered_by)
           values ($1, $2, $3, $4, $5, $6)`,
          [schoolId, es.id, s.id, marks, absent, userIds[subjectTeacher(subj.code)] ?? userIds.admin],
        );
      }
      const ut = await sql.one<{ id: string }>(
        `insert into public.examination_subjects (school_id, examination_id, subject_id, exam_date, max_marks, pass_marks)
         values ($1, $2, $3, $4, 25, 9) returning id`,
        [schoolId, unitTest.id, subjectIds[subj.code], addDays(today, -3 + (i % 3))],
      );
      // Only Maths has marks so far — the rest are waiting for teachers to enter them.
      if (subj.code === "MAT") {
        for (const s of classStudents) {
          await sql.exec(
            `insert into public.marks (school_id, examination_subject_id, student_id, marks_obtained, is_absent, entered_by)
             values ($1, $2, $3, $4, false, $5)`,
            [schoolId, ut.id, s.id, 10 + Math.floor(rand() * 16), userIds[subjectTeacher("MAT")] ?? userIds.admin],
          );
        }
      }
    }
  }

  // ---- Fees -------------------------------------------------------------------
  const feeCategory = async (name: string, description: string) =>
    (
      await sql.one<{ id: string }>(
        "insert into public.fee_categories (school_id, name, description) values ($1, $2, $3) returning id",
        [schoolId, name, description],
      )
    ).id;
  const tuition = await feeCategory("Tuition fee", "Academic tuition for the year");
  const activity = await feeCategory("Activity fee", "Sports, clubs and events");
  const transportCat = await feeCategory("Transport fee", "School van / bus");

  const installmentIds: Record<string, { tuition: { id: string; amount: number; due: string; label: string }[]; activity: { id: string; amount: number; due: string; label: string } }> = {};
  for (const s of plan.sections) {
    if (installmentIds[s.className]) continue;
    const yearly = (isA ? 33_000 : 45_000) + s.grade * 1_000; // rupees
    const tuitionTotal = yearly * 100;
    const st = await sql.one<{ id: string }>(
      `insert into public.fee_structures (school_id, academic_year_id, class_id, fee_category_id, total_amount_paise)
       values ($1, $2, $3, $4, $5) returning id`,
      [schoolId, year.id, classIds[s.className], tuition, tuitionTotal],
    );
    const parts = [
      { label: "Term 1", due: "2026-06-15" },
      { label: "Term 2", due: "2026-10-15" },
      { label: "Term 3", due: "2027-01-15" },
    ];
    const per = Math.floor(tuitionTotal / 3);
    const tuitionInst = [];
    for (const [i, p] of parts.entries()) {
      const amount = i === 2 ? tuitionTotal - per * 2 : per;
      const row = await sql.one<{ id: string }>(
        `insert into public.fee_installments (school_id, fee_structure_id, installment_no, label, due_date, amount_paise)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [schoolId, st.id, i + 1, p.label, p.due, amount],
      );
      tuitionInst.push({ id: row.id, amount, due: p.due, label: `Tuition fee – ${p.label}` });
    }
    const act = await sql.one<{ id: string }>(
      `insert into public.fee_structures (school_id, academic_year_id, class_id, fee_category_id, total_amount_paise)
       values ($1, $2, $3, $4, 250000) returning id`,
      [schoolId, year.id, classIds[s.className], activity],
    );
    const actInst = await sql.one<{ id: string }>(
      `insert into public.fee_installments (school_id, fee_structure_id, installment_no, label, due_date, amount_paise)
       values ($1, $2, 1, 'Annual', '2026-07-15', 250000) returning id`,
      [schoolId, act.id],
    );
    installmentIds[s.className] = {
      tuition: tuitionInst,
      activity: { id: actInst.id, amount: 250000, due: "2026-07-15", label: "Activity fee – Annual" },
    };
  }

  type Line = { id: string; amount: number; discount: number; due: string };
  const linesByStudent = new Map<string, Line[]>();
  for (const s of students) {
    const className = sectionLabel[s.sectionId].replace(/ [A-Z]$/, "");
    const inst = installmentIds[className];
    const lines: Line[] = [];
    const isSecondSibling = isA && s.first === "Kavin" && s.guardianId === familyGuardian.id;
    for (const t of inst.tuition) {
      const discount = isSecondSibling ? Math.floor((t.amount * 10 + 50) / 100) : 0; // 10% sibling concession
      const row = await sql.one<{ id: string }>(
        `insert into public.student_fee_assignments
           (school_id, student_id, academic_year_id, fee_category_id, fee_installment_id, description, due_date, amount_paise,
            discount_paise, discount_type, discount_reason, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
        [
          schoolId, s.id, year.id, tuition, t.id, t.label, t.due, t.amount, discount,
          discount ? "sibling" : null, discount ? "10% sibling concession (elder sibling enrolled)" : null, userIds.accounts,
        ],
      );
      lines.push({ id: row.id, amount: t.amount, discount, due: t.due });
    }
    const actRow = await sql.one<{ id: string }>(
      `insert into public.student_fee_assignments
         (school_id, student_id, academic_year_id, fee_category_id, fee_installment_id, description, due_date, amount_paise, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
      [schoolId, s.id, year.id, activity, inst.activity.id, inst.activity.label, inst.activity.due, inst.activity.amount, userIds.accounts],
    );
    lines.push({ id: actRow.id, amount: inst.activity.amount, discount: 0, due: inst.activity.due });
    linesByStudent.set(s.id, lines);
  }

  const recordPayment = async (studentId: string, alloc: { lineId: string; amount: number }[], paidAt: string, method: string) => {
    const total = alloc.reduce((a, b) => a + b.amount, 0);
    const receipt = await sql.one<{ no: string }>("select public.next_receipt_no($1, $2) as no", [schoolId, year.id]);
    const p = await sql.one<{ id: string }>(
      `insert into public.payments (school_id, student_id, academic_year_id, receipt_no, amount_paise, method, mode, status,
         reference_no, paid_at, recorded_by, idempotency_key)
       values ($1, $2, $3, $4, $5, $6, 'offline', 'captured', $7, $8, $9, $10) returning id`,
      [
        schoolId, studentId, year.id, receipt.no, total, method,
        method === "upi" ? `UPI${Math.floor(rand() * 1e10)}` : method === "cheque" ? `CHQ${Math.floor(rand() * 1e6)}` : null,
        paidAt, userIds.accounts, `seed-${receipt.no}`,
      ],
    );
    for (const a of alloc) {
      await sql.exec(
        "insert into public.payment_allocations (school_id, payment_id, student_fee_assignment_id, amount_paise) values ($1, $2, $3, $4)",
        [schoolId, p.id, a.lineId, a.amount],
      );
    }
  };

  for (const [i, s] of students.entries()) {
    const lines = linesByStudent.get(s.id)!;
    const [t1, t2, , act] = lines;
    const net = (l: Line) => l.amount - l.discount;
    const method = pick(["cash", "upi", "upi", "cheque", "bank_transfer"]);
    if (i % 9 !== 4) {
      await recordPayment(s.id, [{ lineId: t1.id, amount: net(t1) }, { lineId: act.id, amount: net(act) }], `2026-06-${String(5 + (i % 20)).padStart(2, "0")}T05:30:00Z`, method);
    } else {
      // A few families paid only part of the first term.
      await recordPayment(s.id, [{ lineId: t1.id, amount: Math.floor(net(t1) / 2) }], "2026-06-20T05:30:00Z", "cash");
    }
    const r = rand();
    if (r < 0.45) {
      await recordPayment(s.id, [{ lineId: t2.id, amount: net(t2) }], `${addDays("2026-10-01", i % 14)}T06:00:00Z`, pick(["upi", "cash"]));
    } else if (r < 0.6) {
      await recordPayment(s.id, [{ lineId: t2.id, amount: Math.floor(net(t2) * 0.4) }], `${addDays("2026-10-03", i % 10)}T06:00:00Z`, "upi");
    }
  }

  // ---- Transport ---------------------------------------------------------------
  const vehicleIds: string[] = [];
  for (const [i, v] of (isA
    ? [
        { reg: "TN 37 AB 1234", type: "van", cap: 20, model: "Force Traveller" },
        { reg: "TN 37 CD 5678", type: "bus", cap: 40, model: "Tata Starbus" },
      ]
    : [{ reg: "TN 59 EF 2468", type: "bus", cap: 40, model: "Ashok Leyland Lynx" }]
  ).entries()) {
    const row = await sql.one<{ id: string }>(
      `insert into public.vehicles (school_id, registration_no, vehicle_type, capacity, make_model, insurance_expiry, fitness_expiry, permit_expiry)
       values ($1, $2, $3, $4, $5, $6, $7, '2027-05-31') returning id`,
      [schoolId, v.reg, v.type, v.cap, v.model, i === 0 ? addDays(today, 20) : "2027-03-31", "2027-02-28"],
    );
    vehicleIds.push(row.id);
  }
  const driverIds: string[] = [];
  for (const key of isA ? ["driver1", "driver2"] : ["driver1"]) {
    const row = await sql.one<{ id: string }>(
      `insert into public.drivers (school_id, staff_id, license_no, license_expiry) values ($1, $2, $3, '2029-08-31') returning id`,
      [schoolId, staffIds[key], `TN${plan.seed}${key.slice(-1)}2015000${key.slice(-1)}`],
    );
    driverIds.push(row.id);
  }
  const transportStudents = students.filter((_, i) => i % 3 === 0 || i === 0);
  if (isA) {
    const kavin = students.find((s) => s.first === "Kavin" && s.guardianId === familyGuardian.id);
    if (kavin && !transportStudents.includes(kavin)) transportStudents.push(kavin);
  }
  let tIndex = 0;
  for (const [ri, r] of plan.routes.entries()) {
    const route = await sql.one<{ id: string }>(
      `insert into public.transport_routes (school_id, name, code, vehicle_id, driver_id, attendant_staff_id)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [schoolId, r.name, r.code, vehicleIds[ri], driverIds[ri], ri === 0 ? staffIds.attendant1 : null],
    );
    const stopIds: string[] = [];
    for (const [si, st] of r.stops.entries()) {
      const row = await sql.one<{ id: string }>(
        `insert into public.route_stops (school_id, route_id, stop_order, name, latitude, longitude, pickup_time, drop_time)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [schoolId, route.id, si + 1, st.name, st.lat, st.lng, st.pickup, st.drop],
      );
      stopIds.push(row.id);
    }
    const share = Math.ceil(transportStudents.length / plan.routes.length);
    for (const s of transportStudents.slice(ri * share, ri * share + share)) {
      await sql.exec(
        `insert into public.student_transport_assignments (school_id, student_id, route_id, stop_id, start_date)
         values ($1, $2, $3, $4, '2026-06-01')`,
        [schoolId, s.id, route.id, stopIds[tIndex++ % (stopIds.length - 1)]],
      );
      // Transport fee: one line per term for students who use transport.
      await sql.exec(
        `insert into public.student_fee_assignments (school_id, student_id, academic_year_id, fee_category_id, description, due_date, amount_paise, created_by)
         values ($1, $2, $3, $4, $5, '2026-10-15', 450000, $6)`,
        [schoolId, s.id, year.id, transportCat, `Transport fee – Term 2 (${r.code})`, userIds.accounts],
      );
    }
  }

  // ---- Activities and achievements ----------------------------------------
  const activityRows = isA
    ? [
        { name: "Football", category: "sports", coord: "teacher4", schedule: "Tue & Thu, 3:45–5:00 pm", venue: "Main ground" },
        { name: "Carnatic Vocal", category: "arts_music", coord: "teacher3", schedule: "Wed, 3:45–4:45 pm", venue: "Music room" },
        { name: "Robotics Club", category: "robotics_stem", coord: "teacher2", schedule: "Sat, 10:00 am–12:00 pm", venue: "STEM lab" },
        { name: "Eco Club", category: "clubs", coord: "teacher1", schedule: "Fri, 3:45–4:30 pm", venue: "Garden" },
        { name: "Science Exhibition 2026", category: "projects_exhibitions", coord: "teacher2", schedule: "Final event on 21 Nov", venue: "Auditorium" },
      ]
    : [
        { name: "Chess Club", category: "clubs", coord: "teacher1", schedule: "Mon, 3:30–4:30 pm", venue: "Library" },
        { name: "Bharatanatyam", category: "arts_music", coord: "teacher1", schedule: "Thu, 3:30–4:30 pm", venue: "Dance hall" },
      ];
  const activityIds: Record<string, string> = {};
  for (const a of activityRows) {
    const row = await sql.one<{ id: string }>(
      `insert into public.extracurricular_activities (school_id, academic_year_id, name, category, description, coordinator_staff_id, schedule, venue, start_date, capacity)
       values ($1, $2, $3, $4, $5, $6, $7, $8, '2026-07-01', 30) returning id`,
      [schoolId, year.id, a.name, a.category, `${a.name} for middle school students.`, staffIds[a.coord], a.schedule, a.venue],
    );
    activityIds[a.name] = row.id;
    const members = students.filter(() => rand() < 0.3);
    if (!members.includes(students[0])) members.push(students[0]);
    for (const m of members) {
      await sql.exec(
        `insert into public.activity_enrollments (school_id, activity_id, student_id, registered_by) values ($1, $2, $3, $4)`,
        [schoolId, row.id, m.id, userIds[a.coord] ?? userIds.admin],
      );
      for (const offset of [-14, -7]) {
        await sql.exec(
          `insert into public.activity_attendance (school_id, activity_id, student_id, session_date, status, marked_by)
           values ($1, $2, $3, $4, $5, $6)`,
          [schoolId, row.id, m.id, addDays(today, offset), rand() < 0.88 ? "present" : "absent", userIds[a.coord] ?? userIds.admin],
        );
      }
    }
  }
  const firstActivity = Object.values(activityIds)[0];
  const achievements = isA
    ? [
        { s: 0, cat: "robotics_stem", title: "Line-follower robot – 2nd place", level: "district", pos: "2nd", on: "2026-09-06", act: "Robotics Club", status: "verified" },
        { s: 0, cat: "sports", title: "Inter-school football tournament", level: "zonal", pos: "Winners", on: "2026-08-23", act: "Football", status: "verified" },
        { s: 5, cat: "arts_music", title: "Thirukkural recitation", level: "school", pos: "1st", on: "2026-08-15", act: null, status: "verified" },
        { s: 0, cat: "competitions", title: "National Science Olympiad – Merit certificate", level: "national", pos: "Merit", on: "2026-10-10", act: null, status: "pending" },
      ]
    : [
        { s: 0, cat: "clubs", title: "District chess championship (U-12)", level: "district", pos: "3rd", on: "2026-09-13", act: "Chess Club", status: "verified" },
      ];
  for (const a of achievements) {
    const verified = a.status === "verified";
    await sql.exec(
      `insert into public.student_achievements (school_id, student_id, activity_id, category, title, level, position, achieved_on, status,
         submitted_by, verified_by, verified_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        schoolId, students[a.s].id, a.act ? activityIds[a.act] : null, a.cat, a.title, a.level, a.pos, a.on, a.status,
        verified ? userIds.admin : parentUser, verified ? userIds.admin : null, verified ? `${a.on}T10:00:00Z` : null,
      ],
    );
  }
  void firstActivity;

  // ---- Announcements and notifications -----------------------------------------
  const announcements = [
    { title: "Quarterly examination results published", body: "Results for the Quarterly Examination are now available in the app under Exams & results. Please review them with your child.", audience: "all", priority: "important", ago: 17 },
    { title: "Deepavali holidays: 7–9 November", body: "The school will remain closed from 7 to 9 November for Deepavali. Classes resume on Tuesday, 10 November. Wishing everyone a safe and happy Deepavali!", audience: "all", priority: "normal", ago: 2 },
    { title: "Parent–Teacher Meeting", body: `The Term 2 Parent–Teacher Meeting will be held on ${addDays(today, 9)} from 9:00 am to 12:30 pm. Please meet your child's class teacher.`, audience: "parents", priority: "important", ago: 1 },
    { title: "Staff meeting on Friday", body: "All teaching staff: brief meeting on Friday at 3:45 pm in the conference room to plan Unit Test 2 evaluation.", audience: "staff", priority: "normal", ago: 3 },
  ];
  for (const a of announcements) {
    await sql.exec(
      `insert into public.announcements (school_id, title, body, audience, priority, status, published_at, created_by)
       values ($1, $2, $3, $4, $5, 'published', $6, $7)`,
      [schoolId, a.title, a.body, a.audience, a.priority, `${addDays(today, -a.ago)}T04:30:00Z`, userIds.admin],
    );
  }
  const notify = async (userId: string | null | undefined, type: string, title: string, body: string, link: string, agoDays: number, read = false) => {
    if (!userId) return;
    await sql.exec(
      `insert into public.notifications (school_id, user_id, type, title, body, link, created_at, read_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [schoolId, userId, type, title, body, link, `${addDays(today, -agoDays)}T05:00:00Z`, read ? `${addDays(today, -agoDays)}T08:00:00Z` : null],
    );
  };
  const childName = isA ? "Aadhya" : "Ayesha";
  await notify(parentUser, "fees", "Term 2 fee due", `The Term 2 tuition fee for ${childName} was due on 15 Oct.`, "/app/fees", 7);
  await notify(parentUser, "marks", "Quarterly results published", `${childName}'s Quarterly Examination results are available.`, "/app/exams", 17, true);
  await notify(parentUser, "homework", "New homework", `English: "Write a letter to your friend about Deepavali" is due soon.`, "/app/homework", 5);
  await notify(parentUser, "announcement", "Deepavali holidays: 7–9 November", "The school will remain closed from 7 to 9 November.", "/app/announcements", 2);
  await notify(userIds.teacher1, "homework", "Submissions to review", "New homework submissions are waiting for review.", "/app/homework", 1);
  await notify(userIds.admin, "admin", "Achievement awaiting verification", "A parent submitted an achievement for verification.", "/app/activities/achievements", 4);
}
