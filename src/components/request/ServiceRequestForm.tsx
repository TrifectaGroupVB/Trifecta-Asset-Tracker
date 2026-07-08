"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  submitServiceRequest,
} from "@/app/request/actions";
import { URGENCIES, type Urgency } from "@/lib/constants";
import { formatRequestNumber } from "@/lib/format";

type EquipmentOption = { id: string; name: string; location: string };

const URGENCY_META: Record<Urgency, { sublabel: string }> = {
  LOW: { sublabel: "Can wait" },
  NORMAL: { sublabel: "This week" },
  URGENT: { sublabel: "Equipment down" },
};

function CameraIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-8 text-text-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        d="M3 8.5a1.5 1.5 0 0 1 1.5-1.5h2l1.4-2.1a1.5 1.5 0 0 1 1.25-.67h5.7a1.5 1.5 0 0 1 1.25.67L17.5 7h2A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function fieldError(msg: string | undefined) {
  if (!msg) return null;
  return <p className="mt-1 text-sm text-danger">{msg}</p>;
}

export function ServiceRequestForm({
  equipment,
  initialEquipmentId,
}: {
  equipment: EquipmentOption[];
  initialEquipmentId: string | null;
}) {
  const [equipmentId, setEquipmentId] = useState<string | null>(initialEquipmentId);
  const [picking, setPicking] = useState(initialEquipmentId == null);
  const [search, setSearch] = useState("");
  const [description, setDescription] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [urgency, setUrgency] = useState<Urgency | null>(null);
  const [requesterName, setRequesterName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{
    requestNumber: number;
    urgency: Urgency;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Free the thumbnail's object URL when it's replaced or on unmount
  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const selected = equipment.find((e) => e.id === equipmentId) ?? null;
  const filtered = equipment.filter((e) =>
    `${e.name} ${e.location}`.toLowerCase().includes(search.trim().toLowerCase())
  );

  function clearError(key: string) {
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function onPhotoChange(file: File | null) {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!equipmentId) nextErrors.equipment = "Pick the equipment this is about.";
    if (!description.trim()) nextErrors.description = "Tell us what's wrong.";
    if (!urgency) nextErrors.urgency = "Pick an urgency level.";
    if (!requesterName.trim()) nextErrors.name = "Enter your name.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const formData = new FormData();
      formData.set("equipmentId", equipmentId!);
      formData.set("description", description);
      formData.set("urgency", urgency!);
      formData.set("requesterName", requesterName);
      if (photoFile) formData.set("photo", photoFile);
      const result = await submitServiceRequest(formData);
      if (result.ok) {
        setConfirmed({
          requestNumber: result.requestNumber,
          urgency: result.urgency,
        });
        window.scrollTo(0, 0);
      } else {
        setSubmitError(result.error);
      }
    } catch {
      setSubmitError("Something went wrong sending the request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) {
    const chipClass =
      confirmed.urgency === "URGENT"
        ? "bg-accent text-bg"
        : confirmed.urgency === "NORMAL"
          ? "border border-status-assigned text-status-assigned"
          : "border border-border text-text-muted";
    return (
      <div className="pt-12 text-center">
        <p className="font-mono text-5xl tracking-tight">
          {formatRequestNumber(confirmed.requestNumber)}
        </p>
        <p className="mt-4 text-text-muted">
          Request received. It&rsquo;s in the queue.
        </p>
        <p className="mt-4">
          <span
            className={`inline-flex min-h-8 items-center rounded-sm px-3 font-display text-sm font-semibold uppercase tracking-widest ${chipClass}`}
          >
            {confirmed.urgency}
          </span>
        </p>
        <Link
          href={selected ? `/equipment/${selected.id}` : "/equipment"}
          className="mt-8 inline-flex min-h-12 items-center px-4 text-accent underline underline-offset-4"
        >
          {selected ? "Back to equipment" : "Browse equipment"}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-6">
      {/* 1 — Equipment */}
      <div>
        <label className="font-display text-xs uppercase tracking-widest text-text-muted">
          Equipment
        </label>
        {selected && !picking ? (
          <div className="mt-1 flex items-center gap-3 rounded-sm border border-border bg-surface px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-semibold uppercase leading-tight tracking-wide">
                {selected.name}
              </p>
              <p className="text-sm text-text-muted">{selected.location}</p>
            </div>
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="min-h-12 shrink-0 px-2 font-display uppercase tracking-wide text-accent"
            >
              Edit
            </button>
          </div>
        ) : (
          <div className="mt-1 rounded-sm border border-border bg-surface">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search equipment…"
              aria-label="Search equipment"
              className="h-12 w-full border-b border-border bg-transparent px-3 placeholder:text-text-muted"
            />
            <ul className="max-h-56 overflow-y-auto">
              {filtered.length === 0 && (
                <li className="px-3 py-3 text-sm text-text-muted">
                  Nothing matches “{search}”.
                </li>
              )}
              {filtered.map((e) => (
                <li key={e.id} className="border-b border-border/50 last:border-0">
                  <button
                    type="button"
                    onClick={() => {
                      setEquipmentId(e.id);
                      setPicking(false);
                      clearError("equipment");
                    }}
                    className="flex min-h-12 w-full flex-col justify-center px-3 py-2 text-left"
                  >
                    <span className="font-display font-semibold uppercase tracking-wide">
                      {e.name}
                    </span>
                    <span className="text-sm text-text-muted">{e.location}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {fieldError(errors.equipment)}
      </div>

      {/* 2 — What's wrong */}
      <div>
        <label
          htmlFor="description"
          className="font-display text-xs uppercase tracking-widest text-text-muted"
        >
          What&rsquo;s wrong
        </label>
        <textarea
          id="description"
          rows={4}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            if (e.target.value.trim()) clearError("description");
          }}
          placeholder="Describe the problem. What's it doing, when did it start?"
          className="mt-1 w-full rounded-sm border border-border bg-surface px-3 py-2 text-text placeholder:text-text-muted"
        />
        {fieldError(errors.description)}
      </div>

      {/* 3 — Photo (optional) */}
      <div>
        <label className="font-display text-xs uppercase tracking-widest text-text-muted">
          Photo <span className="normal-case">(helps the tech — optional)</span>
        </label>
        <input
          ref={fileInputRef}
          type="file"
          name="photo"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => onPhotoChange(e.target.files?.[0] ?? null)}
        />
        {photoPreview ? (
          <div className="mt-1 flex items-center gap-3">
            {/* object URL preview — next/image can't optimize blob: URLs */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoPreview}
              alt="Photo attached to this request"
              className="h-28 w-40 rounded-sm border border-border object-cover"
            />
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-12 text-left font-display uppercase tracking-wide text-accent"
              >
                Change photo
              </button>
              <button
                type="button"
                onClick={() => {
                  onPhotoChange(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="min-h-12 text-left font-display uppercase tracking-wide text-text-muted"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-1 flex h-28 w-full flex-col items-center justify-center gap-2 rounded-sm border-2 border-dashed border-border bg-surface text-text-muted"
          >
            <CameraIcon />
            <span className="text-sm">Tap to take a photo or upload</span>
          </button>
        )}
      </div>

      {/* 4 — Urgency */}
      <fieldset>
        <legend className="font-display text-xs uppercase tracking-widest text-text-muted">
          Urgency
        </legend>
        <div className="mt-1 flex flex-col gap-2">
          {URGENCIES.map((u) => {
            const isSelected = urgency === u;
            const base =
              "flex min-h-14 w-full items-center justify-between rounded-sm px-4 text-left";
            const style =
              u === "URGENT"
                ? "bg-accent text-bg"
                : "border border-border bg-surface text-text";
            const selectedRing = isSelected
              ? "ring-2 ring-accent ring-offset-2 ring-offset-bg"
              : "";
            return (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => {
                  setUrgency(u);
                  clearError("urgency");
                }}
                className={`${base} ${style} ${selectedRing}`}
              >
                <span className="font-display text-lg font-semibold uppercase tracking-wide">
                  {u}
                </span>
                <span
                  className={`text-sm ${u === "URGENT" ? "text-bg/80" : "text-text-muted"}`}
                >
                  {isSelected ? "✓ " : ""}
                  {URGENCY_META[u].sublabel}
                </span>
              </button>
            );
          })}
        </div>
        {fieldError(errors.urgency)}
      </fieldset>

      {/* 5 — Your name */}
      <div>
        <label
          htmlFor="requesterName"
          className="font-display text-xs uppercase tracking-widest text-text-muted"
        >
          Your name
        </label>
        <input
          id="requesterName"
          type="text"
          value={requesterName}
          onChange={(e) => {
            setRequesterName(e.target.value);
            if (e.target.value.trim()) clearError("name");
          }}
          placeholder="Who's reporting this?"
          className="mt-1 h-12 w-full rounded-sm border border-border bg-surface px-3 text-text placeholder:text-text-muted"
        />
        {fieldError(errors.name)}
      </div>

      {submitError && <p className="text-sm text-danger">{submitError}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="h-12 w-full rounded-sm bg-accent font-display text-lg font-semibold uppercase tracking-wide text-bg disabled:opacity-60"
      >
        {submitting ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}
