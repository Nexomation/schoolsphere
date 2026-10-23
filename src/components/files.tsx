"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export type FileItem = { id: string; file_name: string; size_bytes: number; mine?: boolean };

function size(bytes: number) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function FileList({ files, onRemove }: { files: FileItem[]; onRemove?: (id: string) => void }) {
  if (!files.length) return null;
  return (
    <ul className="grid gap-1.5">
      {files.map((f) => (
        <li key={f.id} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm">
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <a href={`/api/files/${f.id}`} target="_blank" rel="noopener" className="min-w-0 flex-1 truncate hover:text-primary hover:underline">
            {f.file_name}
          </a>
          <span className="text-xs text-muted-foreground tabular">{size(f.size_bytes)}</span>
          {onRemove && f.mine && (
            <Button size="icon-xs" variant="ghost" aria-label={`Remove ${f.file_name}`} onClick={() => onRemove(f.id)}>
              <X />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Uploads to /api/files, which re-checks that the user may attach files to this record. */
export function FileUploader({
  entity,
  entityId,
  files,
  removeAction,
  label = "Attach files",
}: {
  entity: "assignment" | "submission" | "achievement";
  entityId: string;
  files: FileItem[];
  removeAction?: (fileId: string) => Promise<{ ok: boolean; error?: string }>;
  label?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(list)) {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch(`/api/files?entity=${entity}&id=${entityId}`, { method: "POST", body });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) toast.error(`${file.name}: ${json.error ?? "upload failed"}`);
        else toast.success(`${file.name} uploaded`);
      }
      router.refresh();
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="grid gap-2">
      <FileList
        files={files}
        onRemove={
          removeAction
            ? async (id) => {
                const res = await removeAction(id);
                if (!res.ok) toast.error(res.error ?? "Could not remove file");
                router.refresh();
              }
            : undefined
        }
      />
      <div>
        <input ref={input} type="file" multiple className="sr-only" id={`upload-${entityId}`} accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.txt" onChange={(e) => upload(e.target.files)} />
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Paperclip aria-hidden />}
          {label}
        </Button>
        <p className="mt-1 text-xs text-muted-foreground">PDF, images, DOCX or TXT, up to 10 MB each.</p>
      </div>
    </div>
  );
}
