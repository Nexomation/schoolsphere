"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { ok, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { withService } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { indianPhone } from "@/lib/schemas/common";

const demoRequest = z.object({
  schoolName: z.string().trim().min(2, "Enter your school's name").max(200),
  contactName: z.string().trim().min(2, "Enter your name").max(120),
  email: z.email("Enter a valid email").max(200),
  phone: indianPhone,
  city: z.string().trim().max(80).optional(),
  studentCount: z.union([z.literal(""), z.coerce.number().int().min(1).max(50000)]).optional(),
  message: z.string().trim().max(2000).optional(),
  website: z.string().max(0).optional(), // honeypot: real people leave this empty
});

// Per-IP limit for the public form (per server instance).
const recent = new Map<string, number[]>();

export async function requestDemoAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseInput(demoRequest, input);
    const ip = ((await headers()).get("x-forwarded-for") ?? "local").split(",")[0].trim();
    const now = Date.now();
    const hits = (recent.get(ip) ?? []).filter((t) => now - t < 3_600_000);
    if (hits.length >= 5) throw new AppError("Too many requests from this network. Please try again later or email us.");
    recent.set(ip, [...hits, now]);
    // Anonymous visitors have no database access; the request is stored by the server.
    await withService((sql) =>
      sql.exec(
        "insert into demo_requests (school_name, contact_name, email, phone, city, student_count, message) values ($1, $2, $3, $4, $5, $6, $7)",
        [data.schoolName, data.contactName, data.email.toLowerCase(), data.phone, data.city || null, data.studentCount === "" || data.studentCount === undefined ? null : data.studentCount, data.message || null],
      ),
    );
    return ok(null, "Thank you! Our team will call you within two working days.");
  });
}
