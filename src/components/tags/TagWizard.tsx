"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  assignTagAsStation,
  assignTagToEquipment,
  createEquipmentAndAssignTag,
  type AssignTagResult,
} from "@/app/t/[code]/actions";
import { AppHeader } from "@/components/AppHeader";
import { DataPlate } from "@/components/DataPlate";

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

export function TagWizard({
  code,
  equipment,
  restaurantName,
}: {
  code: string;
  equipment: EquipmentOption[];
  restaurantName: string;
}) {
  const [step, setStep] = useState<Step>("role");
  const [search, setSearch] = useState("");
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Summary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
            Just the basics — specs, parts, and manuals get added later in Admin.
          </p>
          <form
            className="mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(createEquipmentAndAssignTag, new FormData(e.currentTarget));
            }}
          >
            <label htmlFor="name" className={`${labelClass} mt-0`}>Name</label>
            <input id="name" name="name" required placeholder="e.g. Ice Machine" className={inputClass} />
            <label htmlFor="manufacturer" className={labelClass}>Manufacturer</label>
            <input id="manufacturer" name="manufacturer" required placeholder="e.g. Hoshizaki" className={inputClass} />
            <label htmlFor="model" className={labelClass}>Model #</label>
            <input id="model" name="model" required placeholder="From the nameplate" className={`${inputClass} font-mono`} />
            <label htmlFor="serial" className={labelClass}>Serial #</label>
            <input id="serial" name="serial" required placeholder="From the nameplate" className={`${inputClass} font-mono`} />
            <label htmlFor="location" className={labelClass}>Location</label>
            <input id="location" name="location" required placeholder="e.g. Bar — back counter" className={inputClass} />

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
