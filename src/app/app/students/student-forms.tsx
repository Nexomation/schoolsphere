"use client";

import { useRouter } from "next/navigation";
import { FormGrid, SelectField, SubmitButton, TextareaField, TextField } from "@/components/form/fields";
import { useActionForm } from "@/components/form/use-action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BLOOD_GROUPS, GENDERS, RELATIONSHIPS } from "@/lib/schemas/common";
import { admissionInput, studentUpdateInput } from "@/lib/schemas/students";
import { admitStudentAction, updateStudentAction } from "./actions";

const genderOptions = GENDERS.map((g) => ({ value: g, label: g[0].toUpperCase() + g.slice(1) }));
const bloodOptions = BLOOD_GROUPS.map((b) => ({ value: b, label: b }));
const relationOptions = RELATIONSHIPS.map((r) => ({ value: r, label: r[0].toUpperCase() + r.slice(1) }));

export function AdmissionForm({ sections, today }: { sections: { value: string; label: string }[]; today: string }) {
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: admissionInput,
    defaultValues: {
      admissionNo: "",
      firstName: "",
      lastName: "",
      dateOfBirth: "",
      gender: undefined,
      bloodGroup: "",
      address: "",
      emisNo: "",
      admissionDate: today,
      medicalNotes: "",
      sectionId: "",
      rollNo: "",
      guardian: { fullName: "", relationship: "father", phone: "", email: "", occupation: "" },
    },
    action: admitStudentAction,
    onSuccess: (d) => router.push(`/app/students/${d.id}`),
  });
  const c = form.control;
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Student</CardTitle>
          <CardDescription>As recorded on the admission form and birth certificate.</CardDescription>
        </CardHeader>
        <CardContent>
          <FormGrid>
            <TextField control={c} name="firstName" label="First name" required autoComplete="off" />
            <TextField control={c} name="lastName" label="Last name / initial" autoComplete="off" />
            <TextField control={c} name="dateOfBirth" label="Date of birth" type="date" required />
            <SelectField control={c} name="gender" label="Gender" options={genderOptions} required />
            <TextField control={c} name="admissionNo" label="Admission number" required />
            <TextField control={c} name="admissionDate" label="Admission date" type="date" required />
            <SelectField control={c} name="sectionId" label="Class & section" options={sections} required />
            <TextField control={c} name="rollNo" label="Roll number" type="number" inputMode="numeric" description="Leave empty to assign the next number" />
            <SelectField control={c} name="bloodGroup" label="Blood group" options={bloodOptions} allowNone noneLabel="Not recorded" />
            <TextField control={c} name="emisNo" label="EMIS number" description="Tamil Nadu EMIS ID, if available" />
            <TextareaField control={c} name="address" label="Address" rows={2} className="sm:col-span-2" />
            <TextareaField control={c} name="medicalNotes" label="Medical notes" rows={2} className="sm:col-span-2" description="Allergies or conditions staff should know about. Visible to school staff only." />
          </FormGrid>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Primary guardian</CardTitle>
          <CardDescription>The link is marked verified because it comes from the school&apos;s admission records.</CardDescription>
        </CardHeader>
        <CardContent>
          <FormGrid>
            <TextField control={c} name="guardian.fullName" label="Full name" required />
            <SelectField control={c} name="guardian.relationship" label="Relationship" options={relationOptions} required />
            <TextField control={c} name="guardian.phone" label="Mobile number" type="tel" inputMode="tel" required placeholder="98765 43210" />
            <TextField control={c} name="guardian.email" label="Email" type="email" description="Needed to invite the parent to the app" />
            <TextField control={c} name="guardian.occupation" label="Occupation" />
          </FormGrid>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <SubmitButton pending={pending}>Admit student</SubmitButton>
      </div>
    </form>
  );
}

export function EditStudentForm({
  student,
}: {
  student: {
    id: string;
    admission_no: string;
    first_name: string;
    last_name: string;
    date_of_birth: string;
    gender: string;
    blood_group: string | null;
    address: string | null;
    emis_no: string | null;
    admission_date: string;
    medical_notes: string | null;
  };
}) {
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: studentUpdateInput,
    defaultValues: {
      id: student.id,
      admissionNo: student.admission_no,
      firstName: student.first_name,
      lastName: student.last_name,
      dateOfBirth: student.date_of_birth,
      gender: student.gender as (typeof GENDERS)[number],
      bloodGroup: (student.blood_group ?? "") as "",
      address: student.address ?? "",
      emisNo: student.emis_no ?? "",
      admissionDate: student.admission_date,
      medicalNotes: student.medical_notes ?? "",
    },
    action: updateStudentAction,
    onSuccess: () => {
      router.push(`/app/students/${student.id}`);
      router.refresh();
    },
  });
  const c = form.control;
  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardContent className="pt-6">
          <FormGrid>
            <TextField control={c} name="firstName" label="First name" required />
            <TextField control={c} name="lastName" label="Last name / initial" />
            <TextField control={c} name="dateOfBirth" label="Date of birth" type="date" required />
            <SelectField control={c} name="gender" label="Gender" options={genderOptions} required />
            <TextField control={c} name="admissionNo" label="Admission number" required />
            <TextField control={c} name="admissionDate" label="Admission date" type="date" required />
            <SelectField control={c} name="bloodGroup" label="Blood group" options={bloodOptions} allowNone noneLabel="Not recorded" />
            <TextField control={c} name="emisNo" label="EMIS number" />
            <TextareaField control={c} name="address" label="Address" rows={2} className="sm:col-span-2" />
            <TextareaField control={c} name="medicalNotes" label="Medical notes" rows={2} className="sm:col-span-2" />
          </FormGrid>
          <div className="mt-6 flex justify-end">
            <SubmitButton pending={pending}>Save changes</SubmitButton>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
