"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileUp, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ImportRowResult } from "@/lib/data/students";
import { commitImportAction, previewImportAction } from "../actions";

export function ImportWizard() {
  const router = useRouter();
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<{ results: ImportRowResult[]; validCount: number; missingColumns: string[] } | null>(null);
  const [pending, start] = useTransition();

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2_000_000) {
      toast.error("The file is larger than 2 MB.");
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setCsv(text);
      start(async () => {
        const res = await previewImportAction(text);
        if (res.ok) setPreview(res.data);
        else toast.error(res.error);
      });
    };
    reader.readAsText(file);
  };

  const commit = () =>
    start(async () => {
      if (!csv) return;
      const res = await commitImportAction(csv);
      if (res.ok) {
        toast.success(res.message);
        router.push("/app/students");
        router.refresh();
      } else toast.error(res.error);
    });

  const errors = preview?.results.filter((r) => r.status !== "ok").length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload and review</CardTitle>
        <CardDescription>Rows with errors or duplicates are skipped. Valid rows are imported together.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center hover:bg-muted/50">
          <FileUp className="size-6 text-muted-foreground" aria-hidden />
          <span className="text-sm font-medium">{fileName || "Choose a CSV file"}</span>
          <span className="text-xs text-muted-foreground">UTF-8 CSV, up to 2,000 rows</span>
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>

        {pending && !preview && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Checking rows…
          </p>
        )}

        {preview && preview.missingColumns.length > 0 && (
          <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">Missing required columns: {preview.missingColumns.join(", ")}</p>
        )}

        {preview && preview.results.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-success">
                <CheckCircle2 className="size-4" aria-hidden /> {preview.validCount} ready to import
              </span>
              <span className="flex items-center gap-1.5 text-destructive">
                <XCircle className="size-4" aria-hidden /> {errors} will be skipped
              </span>
              <Button className="ml-auto" onClick={commit} disabled={pending || preview.validCount === 0}>
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                Import {preview.validCount} students
              </Button>
            </div>
            <div className="max-h-[28rem] overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Line</TableHead>
                    <TableHead>Admission no</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.results.map((r) => (
                    <TableRow key={r.line}>
                      <TableCell className="tabular">{r.line}</TableCell>
                      <TableCell>{r.admissionNo}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>{r.sectionLabel}</TableCell>
                      <TableCell>
                        <StatusBadge status={r.status === "ok" ? "active" : r.status === "duplicate" ? "pending" : "rejected"} label={r.status === "ok" ? "Ready" : r.status === "duplicate" ? "Duplicate" : "Error"} />
                        {r.messages.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{r.messages.join("; ")}</p>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
