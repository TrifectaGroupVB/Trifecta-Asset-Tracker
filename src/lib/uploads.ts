import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";

// Storage: Vercel Blob when BLOB_READ_WRITE_TOKEN is set (production),
// local /public/uploads otherwise (dev). Same URL-shaped result either way.

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heif",
};
const PDF_TYPES: Record<string, string> = { "application/pdf": "pdf" };

const MAX_BYTES = 20 * 1024 * 1024;

export type SaveUploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function saveUpload(
  file: File,
  subdir: UploadSubdir,
  kind: "image" | "pdf"
): Promise<SaveUploadResult> {
  if (file.size === 0) return { ok: false, error: "That file is empty." };
  const buffer = Buffer.from(await file.arrayBuffer());
  return saveUploadBuffer(buffer, file.type, subdir, kind);
}

export type UploadSubdir =
  | "equipment"
  | "manuals"
  | "parts"
  | "requests"
  | "brand";

// Same as saveUpload but takes bytes that have already been read. Used where
// the caller needs the buffer for something else too (the manual parts
// importer reads the PDF *and* stores it) — a File's stream can only be
// consumed once, so re-reading it inside here would come back empty.
export async function saveUploadBuffer(
  buffer: Buffer,
  contentType: string,
  subdir: UploadSubdir,
  kind: "image" | "pdf"
): Promise<SaveUploadResult> {
  if (buffer.byteLength === 0) return { ok: false, error: "That file is empty." };
  if (buffer.byteLength > MAX_BYTES)
    return { ok: false, error: "File is too big — keep it under 20 MB." };
  const ext = (kind === "image" ? IMAGE_TYPES : PDF_TYPES)[contentType];
  if (!ext)
    return {
      ok: false,
      error: kind === "image" ? "That file isn't a photo." : "That file isn't a PDF.",
    };

  const filename = `${randomUUID()}.${ext}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const blob = await put(`${subdir}/${filename}`, buffer, {
        access: "public",
        contentType,
      });
      return { ok: true, url: blob.url };
    } catch {
      return { ok: false, error: "Upload failed — please try again." };
    }
  }

  const dir = path.join(process.cwd(), "public", "uploads", subdir);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buffer);
  return { ok: true, url: `/uploads/${subdir}/${filename}` };
}
