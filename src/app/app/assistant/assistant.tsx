"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Copy, Loader2, Search, ShieldCheck, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { AiResult } from "@/lib/ai/features";
import { askAction, circularAction, classTrendsAction, explainReportAction, markGenerationAction, saveDraftRemarkAction, studentSummaryAction, worksheetAction } from "./actions";

type Option = { value: string; label: string };
type Result = { ok: true; data: AiResult } | { ok: false; error: string };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Picker({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: Option[]; label: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue placeholder="Select…" />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function useRunner() {
  const [result, setResult] = useState<AiResult | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) setResult(r.data);
      else toast.error(r.error);
    });
  return { result, pending, run, setResult };
}

/** Output panel: always labelled, editable, never published automatically. */
function Output({ result, children }: { result: AiResult; children?: (text: string) => React.ReactNode }) {
  const [text, setText] = useState(result.text);
  const [reviewed, setReviewed] = useState<"approved" | "discarded" | null>(null);
  return (
    <div className="mt-4 grid gap-3 rounded-xl border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {result.source === "ai" ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-warning/10 px-2 py-0.5 font-medium text-warning">
            <Sparkles className="size-3.5" aria-hidden /> AI-generated suggestion ({result.model}) — review and edit before using. Not a verified school record.
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-medium text-muted-foreground">
            <ShieldCheck className="size-3.5" aria-hidden /> Template built from school records (AI not configured or unavailable)
          </span>
        )}
      </div>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(22, Math.max(6, text.split("\n").length + 1))} aria-label="Generated text" className="bg-background font-normal" />
      <p className="text-xs text-muted-foreground">Data shared: {result.dataShared}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(text).then(() => toast.success("Copied"))}>
          <Copy aria-hidden /> Copy
        </Button>
        {children?.(text)}
        {result.generationId && !reviewed && (
          <>
            <Button size="sm" variant="ghost" onClick={() => markGenerationAction(result.generationId!, "approved").then(() => setReviewed("approved"))}>
              <ThumbsUp aria-hidden /> Useful
            </Button>
            <Button size="sm" variant="ghost" onClick={() => markGenerationAction(result.generationId!, "discarded").then(() => setReviewed("discarded"))}>
              <ThumbsDown aria-hidden /> Discard
            </Button>
          </>
        )}
        {reviewed && <span className="self-center text-xs text-muted-foreground">{reviewed === "approved" ? "Marked as reviewed" : "Discarded"}</span>}
      </div>
    </div>
  );
}

export function Assistant({
  role,
  sections,
  students,
  exams,
  subjects,
}: {
  role: string;
  sections: Option[];
  students: (Option & { classId: string | null })[];
  exams: (Option & { classId: string })[];
  subjects: Option[];
}) {
  const teaching = role === "teacher" || role === "school_admin";
  const finance = role === "accountant" || role === "school_admin";
  const defaultTab = teaching ? "worksheet" : "explain";
  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList className="mb-4 flex-wrap">
        {teaching && <TabsTrigger value="worksheet">Worksheet</TabsTrigger>}
        {role === "school_admin" && <TabsTrigger value="circular">Circular</TabsTrigger>}
        {teaching && <TabsTrigger value="trends">Class insights</TabsTrigger>}
        {teaching && <TabsTrigger value="student">Student progress</TabsTrigger>}
        {finance && <TabsTrigger value="explain">Explain a report</TabsTrigger>}
        <TabsTrigger value="ask">Find information</TabsTrigger>
      </TabsList>
      {teaching && (
        <TabsContent value="worksheet">
          <WorksheetTab subjects={subjects} />
        </TabsContent>
      )}
      {role === "school_admin" && (
        <TabsContent value="circular">
          <CircularTab />
        </TabsContent>
      )}
      {teaching && (
        <TabsContent value="trends">
          <TrendsTab sections={sections} />
        </TabsContent>
      )}
      {teaching && (
        <TabsContent value="student">
          <StudentTab students={students} exams={exams} />
        </TabsContent>
      )}
      {finance && (
        <TabsContent value="explain">
          <ExplainTab admin={role === "school_admin"} />
        </TabsContent>
      )}
      <TabsContent value="ask">
        <AskTab />
      </TabsContent>
    </Tabs>
  );
}

function WorksheetTab({ subjects }: { subjects: Option[] }) {
  const { result, pending, run } = useRunner();
  const [v, setV] = useState({ grade: "Class 6", subject: subjects[0]?.label ?? "Mathematics", topic: "", count: "10", difficulty: "mixed", format: "mixed" });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Homework questions and worksheets</CardTitle>
        <CardDescription>Only the class, subject and topic are sent — no student information.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Class">
            <Input value={v.grade} onChange={(e) => setV({ ...v, grade: e.target.value })} />
          </Field>
          <Field label="Subject">
            <Picker label="Subject" value={v.subject} onChange={(s) => setV({ ...v, subject: s })} options={subjects.map((s) => ({ value: s.label, label: s.label }))} />
          </Field>
          <Field label="Number of questions">
            <Input type="number" min={3} max={20} value={v.count} onChange={(e) => setV({ ...v, count: e.target.value })} />
          </Field>
          <div className="sm:col-span-3">
            <Field label="Topic">
              <Input value={v.topic} onChange={(e) => setV({ ...v, topic: e.target.value })} placeholder="e.g. Fractions — addition with unlike denominators" />
            </Field>
          </div>
          <Field label="Difficulty">
            <Picker label="Difficulty" value={v.difficulty} onChange={(s) => setV({ ...v, difficulty: s })} options={[{ value: "easy", label: "Easy" }, { value: "mixed", label: "Mixed" }, { value: "challenging", label: "Challenging" }]} />
          </Field>
          <Field label="Question type">
            <Picker label="Question type" value={v.format} onChange={(s) => setV({ ...v, format: s })} options={[{ value: "mixed", label: "Mixed" }, { value: "short_answer", label: "Short answer" }, { value: "mcq", label: "Multiple choice" }, { value: "word_problems", label: "Word problems" }]} />
          </Field>
        </div>
        <Button className="mt-4" disabled={pending || v.topic.trim().length < 2} onClick={() => run(() => worksheetAction(v) as Promise<Result>)}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />} Generate worksheet
        </Button>
        {result && (
          <Output key={result.generationId} result={result}>
            {() => (
              <Button asChild size="sm" variant="outline">
                <Link href="/app/homework/new">Create homework</Link>
              </Button>
            )}
          </Output>
        )}
      </CardContent>
    </Card>
  );
}

function CircularTab() {
  const { result, pending, run } = useRunner();
  const [v, setV] = useState({ purpose: "", details: "", audience: "parents", tone: "formal" });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Draft a circular</CardTitle>
        <CardDescription>Do not type children&apos;s personal details here. You review and publish the final text yourself.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Field label="Purpose">
          <Input value={v.purpose} onChange={(e) => setV({ ...v, purpose: e.target.value })} placeholder="e.g. Annual Sports Day on 15 November" />
        </Field>
        <Field label="Key details">
          <Textarea rows={4} value={v.details} onChange={(e) => setV({ ...v, details: e.target.value })} placeholder="Date, time, venue, what to bring, deadlines…" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Audience">
            <Picker label="Audience" value={v.audience} onChange={(s) => setV({ ...v, audience: s })} options={[{ value: "parents", label: "Parents" }, { value: "students", label: "Students" }, { value: "staff", label: "Staff" }, { value: "everyone", label: "Everyone" }]} />
          </Field>
          <Field label="Tone">
            <Picker label="Tone" value={v.tone} onChange={(s) => setV({ ...v, tone: s })} options={[{ value: "formal", label: "Formal" }, { value: "friendly", label: "Friendly" }, { value: "urgent", label: "Urgent" }]} />
          </Field>
        </div>
        <Button className="w-fit" disabled={pending || v.purpose.trim().length < 3 || v.details.trim().length < 3} onClick={() => run(() => circularAction(v) as Promise<Result>)}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />} Draft circular
        </Button>
        {result && (
          <Output key={result.generationId} result={result}>
            {(text) => (
              <Button asChild size="sm">
                <Link href={`/app/announcements?title=${encodeURIComponent(v.purpose)}&draft=${encodeURIComponent(text)}`}>Use as announcement draft</Link>
              </Button>
            )}
          </Output>
        )}
      </CardContent>
    </Card>
  );
}

function TrendsTab({ sections }: { sections: Option[] }) {
  const { result, pending, run } = useRunner();
  const [section, setSection] = useState(sections[0]?.value ?? "");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Class-level academic trends</CardTitle>
        <CardDescription>Uses section totals and averages only — no names or individual records leave the school system.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:w-64">
            <Field label="Section">
              <Picker label="Section" value={section} onChange={setSection} options={sections} />
            </Field>
          </div>
          <Button disabled={pending || !section} onClick={() => run(() => classTrendsAction(section) as Promise<Result>)}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />} Summarise trends
          </Button>
        </div>
        {result && <Output key={result.generationId} result={result} />}
      </CardContent>
    </Card>
  );
}

function StudentTab({ students, exams }: { students: (Option & { classId: string | null })[]; exams: (Option & { classId: string })[] }) {
  const { result, pending, run } = useRunner();
  const [student, setStudent] = useState(students[0]?.value ?? "");
  const [exam, setExam] = useState("");
  const classId = students.find((s) => s.value === student)?.classId;
  const examOptions = exams.filter((e) => e.classId === classId);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly student progress summary</CardTitle>
        <CardDescription>
          The student&apos;s name is not sent; only anonymised figures. Summaries describe school data and suggest support — they never label a child. Nothing is shared with families
          unless you save it as a remark and then approve it on the report card.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:w-72">
            <Field label="Student">
              <Picker label="Student" value={student} onChange={setStudent} options={students} />
            </Field>
          </div>
          <Button disabled={pending || !student} onClick={() => run(() => studentSummaryAction(student) as Promise<Result>)}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />} Summarise progress
          </Button>
        </div>
        {result && (
          <Output key={result.generationId} result={result}>
            {(text) => (
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-56">
                  <Picker label="Examination" value={exam} onChange={setExam} options={examOptions} />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!exam}
                  onClick={async () => {
                    const r = await saveDraftRemarkAction({ studentId: student, examinationId: exam, remark: text.slice(0, 1000), generationId: result.generationId });
                    if (r.ok) toast.success(r.message);
                    else toast.error(r.error);
                  }}
                >
                  Save as draft report-card remark
                </Button>
              </div>
            )}
          </Output>
        )}
      </CardContent>
    </Card>
  );
}

function ExplainTab({ admin }: { admin: boolean }) {
  const { result, pending, run } = useRunner();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Explain a report</CardTitle>
        <CardDescription>Plain-language explanation of school-level totals.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending} onClick={() => run(() => explainReportAction("fees") as Promise<Result>)}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />} Explain fee collection
          </Button>
          {admin && (
            <Button variant="outline" disabled={pending} onClick={() => run(() => explainReportAction("attendance") as Promise<Result>)}>
              Explain this month&apos;s attendance
            </Button>
          )}
        </div>
        {result && <Output key={result.generationId} result={result} />}
      </CardContent>
    </Card>
  );
}

function AskTab() {
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const [answer, setAnswer] = useState<{ answer: string; rows: string[]; classifiedBy: string } | null>(null);
  const ask = () =>
    start(async () => {
      const r = await askAction(q);
      if (r.ok) setAnswer(r.data);
      else toast.error(r.error);
    });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Find information</CardTitle>
        <CardDescription>Answers come straight from school records you are allowed to see. The AI (if enabled) only helps understand the question; it never sees the records.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask();
          }}
        >
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Who is absent today?" aria-label="Question" />
          <Button type="submit" disabled={pending || q.trim().length < 3}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />} Ask
          </Button>
        </form>
        {answer && (
          <div className="rounded-xl border p-4 text-sm">
            <p className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" aria-hidden /> From verified school records
            </p>
            <p className="font-medium">{answer.answer}</p>
            {answer.rows.length > 0 && (
              <ul className="mt-2 grid gap-1">
                {answer.rows.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
