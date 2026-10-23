import type { Metadata } from "next";
import Link from "next/link";
import {
  Bell,
  Bus,
  CalendarCheck2,
  FileText,
  GraduationCap,
  IndianRupee,
  Lock,
  NotebookPen,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Check,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { brand } from "@/lib/brand";
import { DemoForm } from "./demo-form";

export const metadata: Metadata = {
  title: { absolute: `${brand.appName} — ${brand.tagline}` },
  description: "The all-in-one school operating system for Indian schools: attendance, homework, exams, fees, transport tracking, activities and parent communication in one place.",
};

const MODULES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: GraduationCap, title: "Students & admissions", text: "Admissions, guardian linking with verification, CSV import from your existing register, promotions and transfers." },
  { icon: CalendarCheck2, title: "Attendance", text: "Mark a class in under a minute on a phone. Holidays never count as absences; parents are notified the same morning." },
  { icon: NotebookPen, title: "Homework", text: "Assign work with attachments, collect submissions, give feedback and track completion by student and class." },
  { icon: FileText, title: "Exams & report cards", text: "Marks entry with validation, configurable grading, class statistics and printable report cards." },
  { icon: IndianRupee, title: "Fees & receipts", text: "Installments, concessions, counter receipts, online payments, dues and collection reports in rupees." },
  { icon: Bus, title: "School van tracking", text: "Live location from the driver's phone or a GPS tracker, arrival estimates, pickup and drop-off alerts for parents." },
  { icon: Trophy, title: "Activities & achievements", text: "Clubs, sports, robotics and competitions, with a verified achievement timeline and development report." },
  { icon: Bell, title: "Announcements & notifications", text: "Circulars to everyone, a class or only staff, with read status. Email and WhatsApp when you enable them." },
  { icon: Sparkles, title: "AI assistant", text: "Drafts worksheets and circulars and explains reports. Always a suggestion for staff to review, never a decision." },
];

const ROLES = [
  { title: "Principals & administrators", points: ["Today's attendance, fees and alerts on one screen", "Every change recorded in an audit log", "Configure classes, fees and policies yourself"] },
  { title: "Teachers", points: ["Only your sections and subjects", "Attendance, homework and marks from your phone", "Less paperwork, more teaching time"] },
  { title: "Parents", points: ["Attendance, homework, results and fees for each child", "Know when the van is near your stop", "Receipts and circulars without paper slips"] },
  { title: "Accounts & transport", points: ["Receipts, dues and collection reports", "Routes, vehicles, document renewals", "Driver app with pickup confirmation"] },
];

const PLANS = [
  { name: "Starter", price: "₹ —", note: "per student / year", features: ["Students, attendance, homework", "Exams & report cards", "Parent app", "Email support"] },
  { name: "Complete", price: "₹ —", note: "per student / year", features: ["Everything in Starter", "Fees & online payments", "Transport tracking", "Activities & achievements"], highlight: true },
  { name: "Group", price: "Custom", note: "for multiple campuses", features: ["Everything in Complete", "Multi-school management", "Data migration assistance", "Priority support"] },
];

const FAQ = [
  { q: "Is our school's data separate from other schools?", a: "Yes. Every record carries your school's identifier and the database itself enforces that users can only reach their own school's data — not just the app screens. A parent can only see children linked to them after the school verifies the link." },
  { q: "Does it work for State Board, Matriculation and CBSE schools?", a: "Yes. Grading scales, terms, classes from Pre-KG to Class 12 and fee structures are configurable per school, with presets for Tamil Nadu State Board and CBSE." },
  { q: "Can parents pay fees online?", a: "Yes, through a supported Indian payment gateway (Razorpay) once your school's account is connected. Counter payments in cash, UPI, cheque and bank transfer are recorded with numbered receipts." },
  { q: "Do we need GPS devices for van tracking?", a: "No. The driver's phone can share location during a trip. Dedicated GPS trackers are also supported. Parents only see the location while a trip on their child's route is running." },
  { q: "How does the AI assistant handle children's data?", a: "It only drafts and suggests. Student names are not sent to the AI provider, it never publishes marks or decisions, and staff review everything before it is used." },
  { q: "Can we import our existing student list?", a: "Yes. Upload a CSV from your current register; SchoolSphere checks every row, flags duplicates and errors, and imports only what you confirm." },
];

export default function LandingPage() {
  return (
    <div className="bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" aria-label={`${brand.appName} home`}>
            <Logo name={brand.appName} />
          </Link>
          <nav aria-label="Sections" className="hidden gap-5 text-sm text-muted-foreground md:flex">
            <a href="#modules" className="hover:text-foreground">Modules</a>
            <a href="#security" className="hover:text-foreground">Security</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <a href="#contact">Request a demo</a>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="border-b bg-gradient-to-b from-accent/70 to-background">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-24">
            <div>
              <p className="mb-3 inline-flex rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">Built for schools in Tamil Nadu and across India</p>
              <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{brand.tagline}</h1>
              <p className="mt-4 max-w-xl text-lg text-muted-foreground">
                Attendance, homework, exams, fees, school van tracking and parent communication in one simple system that your office staff, teachers and parents can actually use.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" className="h-11 px-5">
                  <a href="#contact">Request a demo</a>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-11 px-5">
                  <Link href="/login">Sign in to your school</Link>
                </Button>
              </div>
              <ul className="mt-8 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                {["Works on any phone", "English interface, Indian formats", "Rupees and receipts", "Role-based access"].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Check className="size-4 text-success" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border bg-card p-5 shadow-sm" aria-label="Product overview">
              <p className="mb-3 text-sm font-medium">Today at a glance</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Attendance today", "Marked by 9:20 am"],
                  ["Fees collected", "With numbered receipts"],
                  ["Homework", "Submitted and reviewed"],
                  ["School van", "Live, with ETA to each stop"],
                ].map(([title, text]) => (
                  <div key={title} className="rounded-xl border bg-background p-3">
                    <p className="font-medium">{title}</p>
                    <p className="text-xs text-muted-foreground">{text}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">Every dashboard figure is calculated from your school&apos;s own records.</p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="roles">
          <h2 id="roles" className="text-2xl font-semibold tracking-tight">One platform, the right view for everyone</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES.map((r) => (
              <div key={r.title} className="rounded-xl border bg-card p-5">
                <h3 className="font-semibold">{r.title}</h3>
                <ul className="mt-3 grid gap-2 text-sm text-muted-foreground">
                  {r.points.map((p) => (
                    <li key={p} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section id="modules" className="border-y bg-muted/40" aria-labelledby="modules-title">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 id="modules-title" className="text-2xl font-semibold tracking-tight">Everything a school runs on</h2>
            <p className="mt-2 text-muted-foreground">Start with the modules you need; they all share the same students, classes and people.</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {MODULES.map((m) => (
                <div key={m.title} className="rounded-xl border bg-card p-5">
                  <span className="mb-3 flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <m.icon className="size-4.5" aria-hidden />
                  </span>
                  <h3 className="font-semibold">{m.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{m.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="security" className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="security-title">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <h2 id="security-title" className="text-2xl font-semibold tracking-tight">Children&apos;s data, handled carefully</h2>
              <p className="mt-2 text-muted-foreground">Security is built into the database, not only the screens.</p>
            </div>
            <ul className="grid gap-4 text-sm">
              {[
                [Lock, "School-level isolation", "Database row-level security keeps each school's records separate, even from direct API requests."],
                [Users, "Role-based access", "Teachers see their classes, parents see verified children only, drivers see just the pickup list."],
                [ShieldCheck, "Audit trail", "Attendance and marks corrections, fee voids and settings changes are recorded with who, when and why."],
              ].map(([Icon, title, text]) => {
                const I = Icon as LucideIcon;
                return (
                  <li key={title as string} className="flex gap-3 rounded-xl border bg-card p-4">
                    <I className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                    <span>
                      <span className="block font-medium">{title as string}</span>
                      <span className="text-muted-foreground">{text as string}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section id="pricing" className="border-y bg-muted/40" aria-labelledby="pricing-title">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 id="pricing-title" className="text-2xl font-semibold tracking-tight">Simple, per-student pricing</h2>
            <p className="mt-2 text-sm text-muted-foreground">Prices are being finalised — the amounts below are placeholders. Ask us for a quote for your school.</p>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {PLANS.map((p) => (
                <div key={p.name} className={`rounded-xl border bg-card p-6 ${p.highlight ? "border-primary ring-1 ring-primary" : ""}`}>
                  <h3 className="font-semibold">{p.name}</h3>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">{p.price}</p>
                  <p className="text-xs text-muted-foreground">{p.note}</p>
                  <ul className="mt-4 grid gap-2 text-sm">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {f}
                      </li>
                    ))}
                  </ul>
                  <Button asChild className="mt-6 w-full" variant={p.highlight ? "default" : "outline"}>
                    <a href="#contact">Get a quote</a>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-3xl px-4 py-16 sm:px-6" aria-labelledby="faq-title">
          <h2 id="faq-title" className="text-2xl font-semibold tracking-tight">Frequently asked questions</h2>
          <div className="mt-6 divide-y rounded-xl border bg-card">
            {FAQ.map((f) => (
              <details key={f.q} className="group p-4">
                <summary className="cursor-pointer list-none font-medium marker:hidden">
                  <span className="flex items-center justify-between gap-3">
                    {f.q}
                    <span className="text-muted-foreground transition-transform group-open:rotate-45" aria-hidden>
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section id="contact" className="border-t bg-gradient-to-b from-background to-accent/50" aria-labelledby="contact-title">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
            <div>
              <h2 id="contact-title" className="text-2xl font-semibold tracking-tight">See SchoolSphere with your own classes</h2>
              <p className="mt-2 text-muted-foreground">Tell us about your school and we will arrange a 30-minute walkthrough for your principal and office team.</p>
              <p className="mt-6 text-sm text-muted-foreground">
                Questions? Write to{" "}
                <a href={`mailto:${brand.supportEmail}`} className="text-primary hover:underline">
                  {brand.supportEmail}
                </a>
              </p>
            </div>
            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <DemoForm />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Logo name={brand.appName} />
          <p>
            © {new Date().getFullYear()} {brand.appName}. {brand.tagline}
          </p>
        </div>
      </footer>
    </div>
  );
}
