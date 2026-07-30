"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  assignTagAsStation,
  assignTagToEquipment,
  createEquipmentAndAssignTag,
  type AssignTagResult,
} from "@/app/t/[code]/actions";
import { scanNameplate } from "@/app/t/[code]/nameplate-actions";
import { AppHeader } from "@/components/AppHeader";
import { DataPlate } from "@/components/DataPlate";
import type { NameplateResult, NameplateSpec } from "@/lib/nameplate";
import { shrinkImage } from "@/lib/shrinkImage";

type EquipmentOption = { id: string; name: string; location: string };
type Step = "role" | "equip-mode" | "equip-new" | "equip-existing" | "station";
type Summary = Extract<AssignTagResult, { ok: true }>["summary"];

const inputClass =
  "mt-1 h-12 w-full rounded-sm border border-border bg-surface px-3 placeholder:text-text-muted";
const labelClass =
  "mt-3 block font-display text-xs uppercase tracking-widest text-text-muted";

// Big data-plate-styled choice button: double border, condensed uppercase.
function PlateButton({
  onClick,
  title,
  sub,
}: {
  onClick: () => void;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-sm border border-border bg-surface p-2 text-left"
    >
      <span className="flex min-h-20 flex-col justify-center border border-border/70 px-4">
        <span className="font-display text-xl font-semibold uppercase tracking-wide">
          {title}
        </span>
        <span className="mt-0.5 text-sm text-text-muted">{sub}</span>
      </span>
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-12 items-center font-display uppercase tracking-wide text-text-muted"
    >
      ‹ Back
    </button>
  );
}

// "ready" — key configured, scanning works.
// "no-key"  — feature on but ANTHROPIC_API_KEY isn't set, so say so plainly
//             instead of offering a button that can only fail.
// "off"     — switched off in Settings; the control isn't rendered at all.
export type NameplateScanState = "ready" | "no-key" | "off";

// Camera-first "read the plate for me" control. Lives above the new-unit form
// and only prefills it — everything stays editable, and creating the unit goes
// through the same action as a hand-typed one.
function NameplateScan({
  onRead,
  scanning,
  setScanning,
}: {
  onRead: (data: NameplateResult) => void;
  scanning: boolean;
  setScanning: (v: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function handle(file: File) {
    setScanning(true);
    setError(null);
    try {
      // Shrink in the browser first, exactly like every other upload in this
      // app. A phone photo is 2–8 MB, which exceeds the Server Action body
      // limit and Vercel's request cap — without this the request is rejected
      // in transit and the server never runs at all. Also normalizes HEIC to
      // JPEG on the way. The server still converts and downsizes again as a
      // backstop for browsers where this can't run.
      const prepared = await shrinkImage(file);
      // shrinkImage hands back the original if the browser couldn't decode it.
      // Say so plainly rather than letting the request die in transit with a
      // generic failure.
      if (prepared.size > 4 * 1024 * 1024) {
        setError(
          "That photo is too large to send. Retake it at a lower resolution, or fill the fields in by hand."
        );
        return;
      }
      const fd = new FormData();
      fd.set("photo", prepared);
      const result = await scanNameplate(fd);
      if (result.ok) onRead(result.data);
      else setError(result.error);
    } catch {
      setError("Couldn't read that photo — try again, or fill it in by hand.");
    } finally {
      setScanning(false);
      // Let the same photo be picked twice in a row (e.g. after an error).
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-sm border border-accent/50 bg-surface p-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label="Data plate photo"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handle(file);
        }}
      />
      <button
        type="button"
        disabled={scanning}
        onClick={() => inputRef.current?.click()}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-sm bg-accent font-display text-base font-semibold uppercase tracking-wide text-bg disabled:opacity-60"
      >
        {scanning ? "Reading the plate…" : "📷 Scan the data plate"}
      </button>
      <p className="mt-2 text-xs text-text-muted">
        Photograph the metal plate on the unit and the fields below fill
        themselves in. Straight off the camera is fine — iPhone photos are
        converted automatically. Check the fields before saving; a greasy or
        angled plate can be misread.
      </p>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}

export function TagWizard({
  code,
  equipment,
  restaurantName,
  nameplateScan,
  scannerDisabledCopy,
}: {
  code: string;
  equipment: EquipmentOption[];
  restaurantName: string;
  nameplateScan: NameplateScanState;
  scannerDisabledCopy: string;
}) {
  const [step, setStep] = useState<Step>("role");
  const [search, setSearch] = useState("");
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Summary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Scan results feed the form through defaultValue, so the form is remounted
  // (via `key`) on each scan — that keeps the inputs uncontrolled and freely
  // editable afterwards instead of fighting React over every keystroke.
  const [scan, setScan] = useState<NameplateResult | null>(null);
  const [scanKey, setScanKey] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [specs, setSpecs] = useState<NameplateSpec[]>([]);

  const filtered = equipment.filter((e) =>
    `${e.name} ${e.location}`.toLowerCase().includes(search.trim().toLowerCase())
  );

  async function run(action: (fd: FormData) => Promise<AssignTagResult>, fd: FormData) {
    setSubmitting(true);
    setError(null);
    try {
      fd.set("code", code);
      const result = await action(fd);
      if (result.ok) {
        setDone(result.summary);
        window.scrollTo(0, 0);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <>
        <AppHeader />
        <main className="mx-auto w-full max-w-2xl p-4 py-8">
        <DataPlate
          title="Tag Assigned"
          subtitle="Setup complete"
          badge={<span className="font-mono text-sm text-accent">{code}</span>}
          fields={
            done.kind === "EQUIPMENT"
              ? [
                  { label: "Tag Code", value: code },
                  { label: "Role", value: "Equipment" },
                  {
                    label: "Points To",
                    value: `${done.name} — ${done.location}`,
                    mono: false,
                    wide: true,
                  },
                ]
              : [
                  { label: "Tag Code", value: code },
                  { label: "Role", value: "Request Station" },
                  {
                    label: "Location",
                    value: done.label ?? "No label",
                    mono: false,
                    wide: true,
                  },
                ]
          }
          stamp="Scan again to test — it now routes straight there"
        />
        {done.kind === "EQUIPMENT" && (
          <Link
            href={`/equipment/${done.equipmentId}`}
            className="mt-4 flex h-12 w-full items-center justify-center rounded-sm bg-accent font-display text-lg font-semibold uppercase tracking-wide text-bg"
          >
            View equipment
          </Link>
        )}
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl p-4 py-8">
        <p className="font-mono text-sm text-text-muted">TAG {code}</p>
        <p className="font-display text-xs uppercase tracking-widest text-accent">
          {restaurantName}
        </p>

      {step === "role" && (
        <>
          <h1 className="mt-1 font-display text-3xl font-semibold uppercase tracking-wide">
            What&rsquo;s this tag for?
          </h1>
          <div className="mt-5 flex flex-col gap-3">
            <PlateButton
              title="Equipment"
              sub="Stick it on a machine — scanning opens that unit's page"
              onClick={() => setStep("equip-mode")}
            />
            <PlateButton
              title="Service Request Station"
              sub="Stick it on a wall — scanning opens the request form"
              onClick={() => setStep("station")}
            />
          </div>
        </>
      )}

      {step === "equip-mode" && (
        <>
          <BackButton onClick={() => setStep("role")} />
          <h1 className="font-display text-3xl font-semibold uppercase tracking-wide">
            New unit or existing?
          </h1>
          <div className="mt-5 flex flex-col gap-3">
            <PlateButton
              title="New Unit"
              sub="Not in the system yet — create it now"
              onClick={() => setStep("equip-new")}
            />
            <PlateButton
              title="Existing Unit"
              sub="Already in the system — e.g. replacing a damaged sticker"
              onClick={() => setStep("equip-existing")}
            />
          </div>
        </>
      )}

      {step === "equip-new" && (
        <>
          <BackButton onClick={() => setStep("equip-mode")} />
          <h1 className="font-display text-3xl font-semibold uppercase tracking-wide">
            New unit
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Just the basics — parts and manuals get added later in Admin.
          </p>

          {nameplateScan === "no-key" && (
            <p className="mt-4 rounded-sm border border-border bg-surface px-3 py-3 text-sm text-text-muted">
              {scannerDisabledCopy}
            </p>
          )}

          {nameplateScan === "ready" && (
            <div className="mt-4">
              <NameplateScan
                scanning={scanning}
                setScanning={setScanning}
                onRead={(data) => {
                  setScan(data);
                  setSpecs(data.specs);
                  // The form remounts on the new key, which clears the file
                  // input inside it — drop the filename label with it.
                  setPhotoName(null);
                  setScanKey((n) => n + 1);
                }}
              />
            </div>
          )}

          {scan && (
            <p className="mt-3 rounded-sm border border-status-completed/50 px-3 py-2 text-sm text-status-completed">
              Plate read. Check every field below — anything the plate didn&rsquo;t
              show clearly was left blank.
            </p>
          )}

          <form
            key={scanKey}
            className="mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              fd.set("specs", JSON.stringify(specs));
              void run(createEquipmentAndAssignTag, fd);
            }}
          >
            <label htmlFor="name" className={`${labelClass} mt-0`}>Name</label>
            <input id="name" name="name" required defaultValue={scan?.name ?? ""} placeholder="e.g. Ice Machine" className={inputClass} />
            <label htmlFor="manufacturer" className={labelClass}>Manufacturer</label>
            <input id="manufacturer" name="manufacturer" required defaultValue={scan?.manufacturer ?? ""} placeholder="e.g. Hoshizaki" className={inputClass} />
            <label htmlFor="model" className={labelClass}>Model #</label>
            <input id="model" name="model" required defaultValue={scan?.model ?? ""} placeholder="From the nameplate" className={`${inputClass} font-mono`} />
            <label htmlFor="serial" className={labelClass}>Serial #</label>
            <input id="serial" name="serial" required defaultValue={scan?.serial ?? ""} placeholder="From the nameplate" className={`${inputClass} font-mono`} />
            <label htmlFor="location" className={labelClass}>Location</label>
            <input id="location" name="location" required placeholder="e.g. Bar — back counter" className={inputClass} />

            {specs.length > 0 && (
              <>
                <p className={labelClass}>
                  Specs from the plate{" "}
                  <span className="normal-case">({specs.length})</span>
                </p>
                <ul className="mt-1 flex flex-col gap-1">
                  {specs.map((s, i) => (
                    <li
                      key={`${s.label}-${i}`}
                      className="flex items-center gap-2 rounded-sm border border-border bg-surface px-3 py-2"
                    >
                      <span className="font-display text-xs uppercase tracking-widest text-text-muted">
                        {s.label}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-sm">
                        {s.value}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${s.label}`}
                        onClick={() => setSpecs((prev) => prev.filter((_, n) => n !== i))}
                        className="size-8 shrink-0 rounded-sm border border-border text-text-muted"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <label className={labelClass}>
              Photo <span className="normal-case">(optional)</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              name="photo"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => setPhotoName(e.target.files?.[0]?.name ?? null)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-1 flex h-14 w-full items-center justify-center rounded-sm border-2 border-dashed border-border bg-surface text-sm text-text-muted"
            >
              {photoName ? `📷 ${photoName} — tap to change` : "Tap to take a photo"}
            </button>

            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="mt-5 h-12 w-full rounded-sm bg-accent font-display text-lg font-semibold uppercase tracking-wide text-bg disabled:opacity-60"
            >
              {submitting ? "Assigning…" : "Create & assign tag"}
            </button>
          </form>
        </>
      )}

      {step === "equip-existing" && (
        <>
          <BackButton onClick={() => setStep("equip-mode")} />
          <h1 className="font-display text-3xl font-semibold uppercase tracking-wide">
            Which unit?
          </h1>
          <div className="mt-4 rounded-sm border border-border bg-surface">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search equipment…"
              aria-label="Search equipment"
              className="h-12 w-full border-b border-border bg-transparent px-3 placeholder:text-text-muted"
            />
            <ul className="max-h-72 overflow-y-auto">
              {filtered.length === 0 && (
                <li className="px-3 py-3 text-sm text-text-muted">
                  Nothing matches “{search}”.
                </li>
              )}
              {filtered.map((e) => (
                <li key={e.id} className="border-b border-border/50 last:border-0">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("equipmentId", e.id);
                      void run(assignTagToEquipment, fd);
                    }}
                    className="flex min-h-14 w-full flex-col justify-center px-3 py-2 text-left disabled:opacity-60"
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
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        </>
      )}

      {step === "station" && (
        <>
          <BackButton onClick={() => setStep("role")} />
          <h1 className="font-display text-3xl font-semibold uppercase tracking-wide">
            Where&rsquo;s it going?
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Optional — a label helps you keep track of stations.
          </p>
          <form
            className="mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(assignTagAsStation, new FormData(e.currentTarget));
            }}
          >
            <label htmlFor="label" className="sr-only">
              Location label
            </label>
            <input
              id="label"
              name="label"
              placeholder='e.g. "Front kitchen wall"'
              className={inputClass}
            />
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="mt-5 h-12 w-full rounded-sm bg-accent font-display text-lg font-semibold uppercase tracking-wide text-bg disabled:opacity-60"
            >
              {submitting ? "Assigning…" : "Assign tag"}
            </button>
          </form>
        </>
      )}
      </main>
    </>
  );
}
