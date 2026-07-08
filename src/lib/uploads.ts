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
  subdir: "equipment" | "manuals" | "parts" | "requests",
  kind: "image" | "pdf"
): Promise<SaveUploadResult> {
  if (file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > MAX_BYTES)
    return { ok: false, error: "File is too big — keep it under 20 MB." };
  const ext = (kind === "image" ? IMAGE_TYPES : PDF_TYPES)[file.type];
  if (!ext)
    return {
      ok: false,
      error: kind === "image" ? "That file isn't a photo." : "That file isn't a PDF.",
    };

  const filename = `${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const blob = await put(`${subdir}/${filename}`, buffer, {
        access: "public",
        contentType: file.type,
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
