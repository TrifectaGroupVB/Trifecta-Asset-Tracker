"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState, useTransition } from "react";

import { shrinkImage } from "@/lib/shrinkImage";

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
