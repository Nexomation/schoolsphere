import "server-only";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * File storage boundary. Bytes go to Supabase Storage (private bucket) in
 * production or to a local folder in development. Access control is NOT done
 * here: callers check the `file_objects` row with the user's RLS scope first.
 */
export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

export const ALLOWED_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "text/plain": [".txt"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Checks declared type, extension and magic bytes so a renamed executable is rejected. */
export function validateUpload(name: string, type: string, data: Buffer): string | null {
  if (data.length === 0) return "The file is empty.";
  if (data.length > MAX_FILE_BYTES) return "Files must be 10 MB or smaller.";
  const ext = path.extname(name).toLowerCase();
  const allowed = ALLOWED_TYPES[type];
  if (!allowed || !allowed.includes(ext)) return "Allowed file types: PDF, JPG, PNG, WEBP, DOCX, TXT.";
  const head = data.subarray(0, 8);
  const magic: Record<string, (b: Buffer) => boolean> = {
    "application/pdf": (b) => b.subarray(0, 4).toString() === "%PDF",
    "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8,
    "image/png": (b) => b.subarray(1, 4).toString() === "PNG",
    "image/webp": (b) => b.subarray(0, 4).toString() === "RIFF",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (b) => b[0] === 0x50 && b[1] === 0x4b,
    "text/plain": (b) => !b.includes(0),
  };
  if (!magic[type](head)) return "The file contents do not match its type.";
  return null;
}

const local: StorageDriver = {
  async put(key, data) {
    const file = path.resolve(/*turbopackIgnore: true*/ env().LOCAL_UPLOAD_DIR, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  },
  async get(key) {
    return readFile(path.resolve(/*turbopackIgnore: true*/ env().LOCAL_UPLOAD_DIR, key));
  },
  async remove(key) {
    await unlink(path.resolve(/*turbopackIgnore: true*/ env().LOCAL_UPLOAD_DIR, key)).catch(() => {});
  },
};

function supabaseBucket() {
  const config = env();
  return createClient(config.NEXT_PUBLIC_SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(config.SUPABASE_STORAGE_BUCKET);
}

const supabase: StorageDriver = {
  async put(key, data, contentType) {
    const { error } = await supabaseBucket().upload(key, data, { contentType, upsert: false });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
  },
  async get(key) {
    const { data, error } = await supabaseBucket().download(key);
    if (error || !data) throw new Error(`Storage download failed: ${error?.message}`);
    return Buffer.from(await data.arrayBuffer());
  },
  async remove(key) {
    await supabaseBucket().remove([key]);
  },
};

export function storage(): StorageDriver {
  return env().STORAGE_DRIVER === "supabase" ? supabase : local;
}
