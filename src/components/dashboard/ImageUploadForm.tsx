"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState, useTransition } from "react";

// Longest-edge cap + JPEG quality for the in-browser shrink. 1800px keeps a
// photo sharp on any screen we render it at while landing well under 1 MB.
const MAX_EDGE = 1800;
const JPEG_QUALITY = 0.82;

// Shrink a photo in the browser BEFORE it uploads. iPhone photos are commonly
// 2–8 MB (and sometimes HEIC), which blows past the Server Action body limit
// (1 MB) and Vercel's request cap (~4.5 MB) — the upload is rejected before the
// server ever runs. Resizing to <=1800px and re-encoding as JPEG brings it to a
// few hundred KB and normalises HEIC to a format that renders everywhere. If
// anything goes wrong (a browser that can't decode the source, no canvas, etc.)
// we fall back to the original file rather than block the upload.
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode failed"));
      el.src = url;
    });
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = Math.min(1, MAX_EDGE / longest);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY)
    );
    if (!blob) return file;
    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ImageUploadForm({
  action,
  hiddenFields = {},
  fieldName = "photo",
  buttonLabel,
  ariaLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  hiddenFields?: Record<string, string>;
  fieldName?: string;
  buttonLabel: string;
  ariaLabel: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a photo first.");
      return;
    }
    const toSend = await shrinkImage(file);
    const fd = new FormData();
    for (const [k, v] of Object.entries(hiddenFields)) fd.set(k, v);
    fd.set(fieldName, toSend);
    startTransition(async () => {
      try {
        await action(fd);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      } catch {
        setError("Upload failed — please try again.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-2 flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        required
        aria-label={ariaLabel}
        className="text-sm text-text-muted file:mr-3 file:h-12 file:rounded-sm file:border file:border-border file:bg-surface file:px-4 file:font-display file:uppercase file:tracking-wide file:text-text"
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="h-12 rounded-sm border border-border bg-surface font-display uppercase tracking-wide disabled:opacity-60"
      >
        {pending ? "Uploading…" : buttonLabel}
      </button>
    </form>
  );
}
