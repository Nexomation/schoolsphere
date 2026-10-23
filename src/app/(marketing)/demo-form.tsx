"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { FormGrid, SubmitButton, TextareaField, TextField } from "@/components/form/fields";
import { useActionForm } from "@/components/form/use-action-form";
import { requestDemoAction } from "./actions";

const schema = z.object({
  schoolName: z.string().trim().min(2, "Enter your school's name"),
  contactName: z.string().trim().min(2, "Enter your name"),
  email: z.email("Enter a valid email"),
  phone: z.string().trim().regex(/^(?:\+?91|0)?[6-9]\d{9}$/, "Enter a 10-digit mobile number"),
  city: z.string().optional(),
  studentCount: z.string().optional(),
  message: z.string().optional(),
  website: z.string().optional(),
});

export function DemoForm() {
  const [sent, setSent] = useState(false);
  const { form, onSubmit, pending } = useActionForm({
    schema,
    defaultValues: { schoolName: "", contactName: "", email: "", phone: "", city: "", studentCount: "", message: "", website: "" },
    action: requestDemoAction,
    onSuccess: () => setSent(true),
  });
  if (sent) {
    return (
      <div className="flex items-start gap-3 rounded-xl border bg-success/5 p-6" role="status">
        <CheckCircle2 className="size-6 text-success" aria-hidden />
        <div>
          <p className="font-semibold">Request received</p>
          <p className="text-sm text-muted-foreground">Our team will call you within two working days to schedule a walkthrough for your school.</p>
        </div>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormGrid>
        <TextField control={form.control} name="schoolName" label="School name" required />
        <TextField control={form.control} name="contactName" label="Your name" required autoComplete="name" />
        <TextField control={form.control} name="email" label="Email" type="email" required autoComplete="email" />
        <TextField control={form.control} name="phone" label="Mobile number" type="tel" required autoComplete="tel" />
        <TextField control={form.control} name="city" label="City" />
        <TextField control={form.control} name="studentCount" label="Number of students" type="number" />
      </FormGrid>
      <TextareaField control={form.control} name="message" label="What would you like to see?" rows={3} />
      {/* Honeypot for bots; hidden from people and assistive technology. */}
      <input type="text" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" {...form.register("website")} />
      <SubmitButton pending={pending}>Request a demo</SubmitButton>
      <p className="text-xs text-muted-foreground">We use these details only to contact you about SchoolSphere.</p>
    </form>
  );
}
