"use server";

import { z } from "zod";
import { ok, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { requireActionContext } from "@/lib/auth/context";
import {
  answerQuestion,
  circularInput,
  classTrends,
  draftCircular,
  explainReport,
  generateWorksheet,
  studentWeeklySummary,
  worksheetInput,
  type AiResult,
} from "@/lib/ai/features";
import { saveRemark } from "@/lib/data/exams";
import { AppError } from "@/lib/errors";

export async function worksheetAction(input: unknown): Promise<ActionResult<AiResult>> {
  return runAction(async () => {
    const ctx = await requireActionContext("ai.use");
    return ok(await generateWorksheet(ctx, parseInput(worksheetInput, input)));
  });
}

export async function circularAction(input: unknown): Promise<ActionResult<AiResult>> {
  return runAction(async () => {
    const ctx = await requireActionContext("ai.use");
    return ok(await draftCircular(ctx, parseInput(circularInput, input)));
  });
}

export async function classTrendsAction(sectionId: string): Promise<ActionResult<AiResult>> {
  return runAction(async () => {
    const ctx = await requireActionContext("ai.use");
    return ok(await classTrends(ctx, z.uuid().parse(sectionId)));
  });
}

export async function studentSummaryAction(studentId: string): Promise<ActionResult<AiResult>> {
  return runAction(async () => {
    const ctx = await requireActionContext("ai.use");
    return ok(await studentWeeklySummary(ctx, z.uuid().parse(studentId)));
  });
}

export async function explainReportAction(kind: "fees" | "attendance"): Promise<ActionResult<AiResult>> {
  return runAction(async () => {
    const ctx = await requireActionContext("ai.use");
    return ok(await explainReport(ctx, z.enum(["fees", "attendance"]).parse(kind)));
  });
}

export async function askAction(question: string): Promise<ActionResult<Awaited<ReturnType<typeof answerQuestion>>>> {
  return runAction(async () => {
    const ctx = await requireActionContext("ai.use");
    return ok(await answerQuestion(ctx, z.string().trim().min(3, "Ask a question").max(300).parse(question)));
  });
}

/** Human review step: an AI summary only becomes a report-card remark as an unapproved draft. */
export async function saveDraftRemarkAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("marks.enter");
    const data = parseInput(z.object({ studentId: z.uuid(), examinationId: z.uuid(), remark: z.string().trim().min(5).max(1000), generationId: z.uuid().optional() }), input);
    await ctx.db(async (sql) => {
      const visible = await sql.maybeOne("select 1 from examinations where id = $1", [data.examinationId]);
      if (!visible) throw new AppError("Examination not found", "not_found");
      await saveRemark(sql, ctx.schoolId, ctx.userId, data, "ai_draft");
      if (data.generationId) await sql.exec("update ai_generations set status = 'approved', reviewed_by = $2, reviewed_at = now() where id = $1", [data.generationId, ctx.userId]);
    });
    return ok(null, "Saved as a draft remark. Approve it on the report card before families can see it.");
  });
}

export async function markGenerationAction(id: string, status: "approved" | "discarded"): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireActionContext("ai.use");
    await ctx.db((sql) =>
      sql.exec("update ai_generations set status = $2, reviewed_by = $3, reviewed_at = now() where id = $1 and user_id = $3", [z.uuid().parse(id), z.enum(["approved", "discarded"]).parse(status), ctx.userId]),
    );
    return ok(null, status === "approved" ? "Marked as reviewed" : "Discarded");
  });
}
