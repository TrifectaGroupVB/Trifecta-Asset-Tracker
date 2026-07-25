import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CompressingForm } from "@/components/dashboard/CompressingForm";
import { ImageUploadForm } from "@/components/dashboard/ImageUploadForm";
import { PinGate } from "@/components/dashboard/PinGate";
import { prisma } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { hasDashboardSession } from "@/lib/session";
import {
  addManual,
  deleteEquipment,
  deleteManual,
  saveEquipmentDetails,
  savePartRow,
  saveSpecRow,
  uploadEquipmentPhoto,
} from "../../actions";

const inputClass =
  "h-12 w-full rounded-sm border border-border bg-surface px-3 placeholder:text-text-muted";
const labelClass =
  "mt-3 block font-display text-xs uppercase tracking-widest text-text-muted";
// Small persistent label above a field within a flex row (spec rows, part
// rows) — unlike labelClass, this doesn't assume it's the first field or
// full-width, so it stays put even once the field already has a value.
const fieldLabelClass =
  "block font-display text-[10px] uppercase tracking-widest text-text-muted";

function dateValue(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function EquipmentEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  if (!(await hasDashboardSession())) return <PinGate />;

  const { id } = await params;
  const { error } = await searchParams;
  const isNew = id === "new";

  const locations = await prisma.location.findMany({ orderBy: { name: "asc" } });

  const eq = isNew
    ? null
    : await prisma.equipment.findUnique({
        where: { id },
        include: {
          specFields: true,
          manuals: true,
          parts: { orderBy: { name: "asc" } },
        },
      });
  if (!isNew && !eq) notFound();

  return (
    <main className="p-4 pb-16">
      <Link
        href="/dashboard/admin"
        className="flex min-h-12 items-center font-display uppercase tracking-wide text-text-muted"
      >
        ‹ Admin
      </Link>
      <h1 className="font-display text-3xl font-semibold uppercase tracking-wide">
        {isNew ? "New Equipment" : eq!.name}
      </h1>

      {error === "has-history" && (
        <p className="mt-3 rounded-sm border border-danger/50 px-3 py-2 text-sm text-danger">
          Can&rsquo;t delete — this equipment has service history. Keep it for the
          records.
        </p>
      )}

      {/* Details */}
      <form
        action={saveEquipmentDetails}
        className="mt-4 rounded-sm border border-border p-3"
      >
        {!isNew && <input type="hidden" name="id" value={eq!.id} />}
        {locations.length > 1 && (
          <>
            <label htmlFor="restaurantId" className={`${labelClass} mt-0`}>Restaurant</label>
            <select
              id="restaurantId"
              name="restaurantId"
              defaultValue={eq?.restaurantId ?? ""}
              required
              className={inputClass}
            >
              <option value="" disabled>
                Choose a location…
              </option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </>
        )}
        <label htmlFor="name" className={locations.length > 1 ? labelClass : `${labelClass} mt-0`}>Name</label>
        <input id="name" name="name" defaultValue={eq?.name ?? ""} required className={inputClass} />
        <label htmlFor="manufacturer" className={labelClass}>Manufacturer</label>
        <input id="manufacturer" name="manufacturer" defaultValue={eq?.manufacturer ?? ""} required className={inputClass} />
        <label htmlFor="model" className={labelClass}>Model</label>
        <input id="model" name="model" defaultValue={eq?.model ?? ""} required className={`${inputClass} font-mono`} />
        <label htmlFor="serial" className={labelClass}>Serial</label>
        <input id="serial" name="serial" defaultValue={eq?.serial ?? ""} required className={`${inputClass} font-mono`} />
        <label htmlFor="location" className={labelClass}>Location</label>
        <input id="location" name="location" defaultValue={eq?.location ?? ""} required className={inputClass} />
        <label htmlFor="installDate" className={labelClass}>Install date</label>
        <input id="installDate" name="installDate" type="date" defaultValue={dateValue(eq?.installDate ?? null)} className={`${inputClass} font-mono`} />
        <label htmlFor="warrantyExpires" className={labelClass}>Warranty expires</label>
        <input id="warrantyExpires" name="warrantyExpires" type="date" defaultValue={dateValue(eq?.warrantyExpires ?? null)} className={`${inputClass} font-mono`} />
        <label htmlFor="notes" className={labelClass}>Notes</label>
        <textarea id="notes" name="notes" rows={2} defaultValue={eq?.notes ?? ""} className="mt-1 w-full rounded-sm border border-border bg-surface px-3 py-2" />
        <button
          type="submit"
          className="mt-4 h-12 w-full rounded-sm bg-accent font-display font-semibold uppercase tracking-wide text-bg"
        >
          {isNew ? "Create equipment" : "Save details"}
        </button>
      </form>

      {!isNew && (
        <>
          {/* Photo */}
          <section className="mt-6 rounded-sm border border-border p-3">
            <h2 className="font-display text-xs uppercase tracking-widest text-text-muted">
              Photo
            </h2>
            {eq!.photoUrl && (
              <div className="relative mt-2 aspect-video overflow-hidden rounded-sm border border-border bg-bg">
                <Image
                  src={eq!.photoUrl}
                  alt={eq!.name}
                  fill
                  sizes="(max-width: 672px) 100vw, 672px"
                  className="object-cover"
                />
              </div>
            )}
            <ImageUploadForm
              action={uploadEquipmentPhoto}
              hiddenFields={{ id: eq!.id }}
              fieldName="photo"
              ariaLabel="Equipment photo"
              buttonLabel={eq!.photoUrl ? "Replace photo" : "Upload photo"}
            />
          </section>

          {/* Spec fields */}
          <section className="mt-6 rounded-sm border border-border p-3">
            <h2 className="font-display text-xs uppercase tracking-widest text-text-muted">
              Spec fields
            </h2>
            <ul className="mt-2 flex flex-col gap-2">
              {eq!.specFields.map((s) => (
                <li key={s.id}>
                  <form action={saveSpecRow} className="flex flex-wrap gap-2">
                    <input type="hidden" name="equipmentId" value={eq!.id} />
                    <input type="hidden" name="specId" value={s.id} />
                    <input name="label" defaultValue={s.label} aria-label="Spec label" required className={`${inputClass} basis-[38%]`} />
                    <input name="value" defaultValue={s.value} aria-label="Spec value" required className={`${inputClass} flex-1 font-mono`} />
                    <button type="submit" name="intent" value="save" className="h-12 rounded-sm border border-border px-3 font-display uppercase tracking-wide">
                      Save
                    </button>
                    <button type="submit" name="intent" value="delete" aria-label={`Delete ${s.label}`} className="h-12 rounded-sm border border-danger/50 px-3 font-display uppercase tracking-wide text-danger">
                      ✕
                    </button>
                  </form>
                </li>
              ))}
            </ul>
            <form action={saveSpecRow} className="mt-2 flex flex-wrap gap-2 border-t border-border pt-3">
              <input type="hidden" name="equipmentId" value={eq!.id} />
              <input name="label" placeholder="Label (e.g. Voltage)" aria-label="New spec label" required className={`${inputClass} basis-[38%]`} />
              <input name="value" placeholder="Value" aria-label="New spec value" required className={`${inputClass} flex-1 font-mono`} />
              <button type="submit" className="h-12 rounded-sm border border-accent px-3 font-display uppercase tracking-wide text-accent">
                Add
              </button>
            </form>
          </section>

          {/* Manuals */}
          <section className="mt-6 rounded-sm border border-border p-3">
            <h2 className="font-display text-xs uppercase tracking-widest text-text-muted">
              Manuals
            </h2>
            <ul className="mt-2 divide-y divide-border">
              {eq!.manuals.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2">
                  <a
                    href={m.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-12 min-w-0 flex-1 items-center text-sm underline underline-offset-4"
                  >
                    <span className="truncate">{m.title}</span>
                  </a>
                  <form action={deleteManual}>
                    <input type="hidden" name="manualId" value={m.id} />
                    <button type="submit" aria-label={`Delete ${m.title}`} className="h-12 rounded-sm border border-danger/50 px-3 font-display uppercase tracking-wide text-danger">
                      ✕
                    </button>
                  </form>
                </li>
              ))}
            </ul>
            <form action={addManual} className="mt-2 flex flex-col gap-2 border-t border-border pt-3">
              <input type="hidden" name="equipmentId" value={eq!.id} />
              <label htmlFor="manual-title" className={fieldLabelClass}>Manual title</label>
              <input id="manual-title" name="title" placeholder="e.g. Installation & Service Manual" required className={inputClass} />
              <label htmlFor="manual-url" className={fieldLabelClass}>Link to PDF</label>
              <input
                id="manual-url"
                name="url"
                type="text"
                placeholder="https://manufacturer.com/manual.pdf"
                className={inputClass}
              />
              <p className="text-center text-xs text-text-muted">— or —</p>
              <label htmlFor="manual-file" className={fieldLabelClass}>Upload a PDF</label>
              <input
                id="manual-file"
                type="file"
                name="file"
                accept="application/pdf"
                aria-label="Manual PDF file"
                className="text-sm text-text-muted file:mr-3 file:h-12 file:rounded-sm file:border file:border-border file:bg-surface file:px-4 file:font-display file:uppercase file:tracking-wide file:text-text"
              />
              <button type="submit" className="h-12 rounded-sm border border-accent font-display uppercase tracking-wide text-accent">
                Add manual
              </button>
            </form>
          </section>

          {/* Parts */}
          <section className="mt-6 rounded-sm border border-border p-3">
            <h2 className="font-display text-xs uppercase tracking-widest text-text-muted">
              Parts
            </h2>
            <ul className="mt-2 flex flex-col gap-3">
              {eq!.parts.map((p) => (
                <li key={p.id} className="rounded-sm border border-border/60 p-2">
                  <CompressingForm action={savePartRow} className="flex flex-col gap-2">
                    <input type="hidden" name="equipmentId" value={eq!.id} />
                    <input type="hidden" name="partId" value={p.id} />
                    <div className="flex items-end gap-2">
                      {p.photoUrl && (
                        <Image
                          src={p.photoUrl}
                          alt={p.name}
                          width={40}
                          height={40}
                          className="size-10 shrink-0 rounded-sm border border-border object-cover"
                        />
                      )}
                      <div className="flex-1">
                        <label htmlFor={`part-name-${p.id}`} className={fieldLabelClass}>Part name</label>
                        <input id={`part-name-${p.id}`} name="name" defaultValue={p.name} required className={inputClass} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label htmlFor={`part-number-${p.id}`} className={fieldLabelClass}>Part #</label>
                        <input id={`part-number-${p.id}`} name="partNumber" defaultValue={p.partNumber} required className={`${inputClass} font-mono`} />
                      </div>
                      <div className="w-28 shrink-0">
                        <label htmlFor={`part-price-${p.id}`} className={fieldLabelClass}>Price</label>
                        <input
                          id={`part-price-${p.id}`}
                          name="price"
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={p.price ?? ""}
                          placeholder={formatPrice(null)}
                          className={`${inputClass} font-mono`}
                        />
                      </div>
                    </div>
                    <label htmlFor={`part-vendor-${p.id}`} className={fieldLabelClass}>Vendor link</label>
                    <input
                      id={`part-vendor-${p.id}`}
                      name="vendorUrl"
                      type="text"
                      defaultValue={p.vendorUrl ?? ""}
                      placeholder="https://vendor.com/product-page"
                      className={inputClass}
                    />
                    {p.vendorUrl && (
                      <a
                        href={p.vendorUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-8 items-center text-xs text-accent underline underline-offset-4"
                      >
                        View at vendor ↗
                      </a>
                    )}
                    <label htmlFor={`part-photo-${p.id}`} className={fieldLabelClass}>Photo</label>
                    <input id={`part-photo-${p.id}`} type="file" name="photo" accept="image/*" aria-label={`Photo for ${p.name}`} className="min-h-12 text-sm text-text-muted file:mr-3 file:h-12 file:rounded-sm file:border file:border-border file:bg-surface file:px-3 file:text-text" />
                    <div className="flex gap-2">
                      <button type="submit" name="intent" value="save" className="h-12 flex-1 rounded-sm border border-border font-display uppercase tracking-wide">
                        Save
                      </button>
                      <button type="submit" name="intent" value="delete" className="h-12 rounded-sm border border-danger/50 px-4 font-display uppercase tracking-wide text-danger">
                        Delete
                      </button>
                    </div>
                  </CompressingForm>
                </li>
              ))}
            </ul>
            <CompressingForm action={savePartRow} className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
              <input type="hidden" name="equipmentId" value={eq!.id} />
              <p className="font-display text-xs uppercase tracking-widest text-text-muted">
                Add a part
              </p>
              <label htmlFor="new-part-name" className={fieldLabelClass}>Part name</label>
              <input id="new-part-name" name="name" placeholder="e.g. Door Gasket" required className={inputClass} />
              <div className="flex gap-2">
                <div className="flex-1">
                  <label htmlFor="new-part-number" className={fieldLabelClass}>Part #</label>
                  <input id="new-part-number" name="partNumber" placeholder="From the manual" required className={`${inputClass} font-mono`} />
                </div>
                <div className="w-28 shrink-0">
                  <label htmlFor="new-part-price" className={fieldLabelClass}>Price</label>
                  <input id="new-part-price" name="price" type="number" step="0.01" min="0" placeholder="Optional" className={`${inputClass} font-mono`} />
                </div>
              </div>
              <label htmlFor="new-part-vendor" className={fieldLabelClass}>Vendor link</label>
              <input
                id="new-part-vendor"
                name="vendorUrl"
                type="text"
                placeholder="https://vendor.com/product-page"
                className={inputClass}
              />
              <label htmlFor="new-part-photo" className={fieldLabelClass}>Photo</label>
              <input id="new-part-photo" type="file" name="photo" accept="image/*" aria-label="New part photo" className="min-h-12 text-sm text-text-muted file:mr-3 file:h-12 file:rounded-sm file:border file:border-border file:bg-surface file:px-3 file:text-text" />
              <button type="submit" className="h-12 rounded-sm border border-accent font-display uppercase tracking-wide text-accent">
                Add part
              </button>
            </CompressingForm>
          </section>

          {/* Danger zone */}
          <details className="mt-8 rounded-sm border border-danger/40">
            <summary className="flex min-h-12 cursor-pointer list-none items-center px-3 font-display uppercase tracking-wide text-danger">
              Delete equipment
            </summary>
            <form action={deleteEquipment} className="border-t border-danger/40 p-3">
              <input type="hidden" name="id" value={eq!.id} />
              <p className="text-sm text-text-muted">
                Removes this equipment, its specs, manuals, and parts. Blocked if it
                has service history.
              </p>
              <button
                type="submit"
                className="mt-3 h-12 w-full rounded-sm bg-danger font-display font-semibold uppercase tracking-wide text-bg"
              >
                Yes, delete permanently
              </button>
            </form>
          </details>
        </>
      )}
    </main>
  );
}
