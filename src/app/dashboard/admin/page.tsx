import Link from "next/link";
import { deleteCredential } from "@/app/dashboard/webauthn-actions";
import { BiometricEnrollButton } from "@/components/dashboard/BiometricEnrollButton";
import { CompressingForm } from "@/components/dashboard/CompressingForm";
import { PinGate } from "@/components/dashboard/PinGate";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/db";
import { hasDashboardSession } from "@/lib/session";
import {
  saveTechRow,
  updateAdminEmail,
  updateLocation,
  uploadLocationPrintLogo,
  resetLocationPrintLogo,
  changePin,
} from "./actions";

const MESSAGES: Record<string, { text: string; kind: "ok" | "error" }> = {
  "wrong-pin": { text: "Current PIN is wrong.", kind: "error" },
  "bad-pin": { text: "New PIN must be exactly 6 digits.", kind: "error" },
  "pin-changed": { text: "PIN updated.", kind: "ok" },
  "logo-saved": { text: "Tag logo updated.", kind: "ok" },
  "logo-reset": { text: "Tag logo reset to default.", kind: "ok" },
  "logo-upload": { text: "That logo didn't upload — use a PNG or JPG image.", kind: "error" },
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string; q?: string; location?: string }>;
}) {
  if (!(await hasDashboardSession())) return <PinGate />;

  const { error, ok, q, location: locationSlug } = await searchParams;
  const message = MESSAGES[error ?? ok ?? ""];
  const query = q?.trim() ?? "";

  const [equipment, techs, adminEmail, credentials, locations] = await Promise.all([
    prisma.equipment.findMany({
      where: {
        ...(locationSlug ? { restaurant: { slug: locationSlug } } : {}),
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { manufacturer: { contains: query, mode: "insensitive" } },
                { model: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
      include: { restaurant: { select: { name: true } } },
    }),
    prisma.tech.findMany({ orderBy: { name: "asc" } }),
    prisma.setting.findUnique({ where: { key: "adminEmail" } }),
    prisma.webAuthnCredential.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
  ]);
  const isFiltered = query !== "" || !!locationSlug;

  const inputClass =
    "h-12 w-full rounded-sm border border-border bg-surface px-3 placeholder:text-text-muted";

  return (
    <main className="p-4 pb-16">
      <h1 className="font-display text-3xl font-semibold uppercase tracking-wide">
        Admin
      </h1>

      {message && (
        <p
          className={`mt-3 rounded-sm border px-3 py-2 text-sm ${
            message.kind === "ok"
              ? "border-status-completed/50 text-status-completed"
              : "border-danger/50 text-danger"
          }`}
        >
          {message.text}
        </p>
      )}

      {/* Equipment */}
      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xs uppercase tracking-widest text-text-muted">
            Equipment
          </h2>
          <Link
            href="/dashboard/admin/equipment/new"
            className="flex min-h-12 items-center px-2 font-display uppercase tracking-wide text-accent"
          >
            + Add equipment
          </Link>
        </div>

        <form action="/dashboard/admin" className="mt-3 flex flex-wrap gap-2">
          <label htmlFor="q" className="sr-only">
            Search name, manufacturer, or model
          </label>
          <input
            id="q"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search name, manufacturer, or model…"
            className="h-12 min-w-0 flex-1 rounded-sm border border-border bg-surface px-3 text-text placeholder:text-text-muted"
          />
          {locations.length > 1 && (
            <>
              <label htmlFor="location" className="sr-only">
                Filter by location
              </label>
              <select
                id="location"
                name="location"
                defaultValue={locationSlug ?? ""}
                className="h-12 shrink-0 rounded-sm border border-border bg-surface px-3 text-text"
              >
                <option value="">All locations</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.slug}>
                    {l.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <button
            type="submit"
            className="h-12 shrink-0 rounded-sm border border-border bg-surface px-4 font-display uppercase tracking-wide text-text"
          >
            Filter
          </button>
          {isFiltered && (
            <Link
              href="/dashboard/admin"
              className="flex h-12 shrink-0 items-center px-2 font-display uppercase tracking-wide text-text-muted underline underline-offset-4"
            >
              Clear
            </Link>
          )}
        </form>

        {equipment.length === 0 && (
          <p className="mt-4 text-text-muted">
            No equipment matches these filters.
          </p>
        )}
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {equipment.map((eq) => (
            <li key={eq.id}>
              <Link
                href={`/dashboard/admin/equipment/${eq.id}`}
                className="flex min-h-12 items-center gap-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    <span
                      className={`font-display font-semibold uppercase tracking-wide ${
                        eq.decommissionedAt ? "text-text-muted line-through" : ""
                      }`}
                    >
                      {eq.name}
                    </span>
                    {eq.decommissionedAt && (
                      <span className="rounded-sm border border-text-muted/50 px-1.5 py-0.5 font-display text-[10px] uppercase tracking-widest text-text-muted">
                        Retired
                      </span>
                    )}
                    {locations.length > 1 && (
                      <span className="font-display text-xs uppercase tracking-widest text-text-muted">
                        {eq.restaurant.name}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-text-muted">
                    {eq.manufacturer}{" "}
                    <span className="font-mono whitespace-nowrap">{eq.model}</span>
                  </p>
                </div>
                <span aria-hidden className="text-text-muted">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Techs */}
      <section className="mt-8">
        <h2 className="font-display text-xs uppercase tracking-widest text-text-muted">
          Techs
        </h2>
        <ul className="mt-2 flex flex-col gap-3">
          {techs.map((t) => (
            <li key={t.id}>
              <form
                action={saveTechRow}
                className="flex flex-col gap-2 rounded-sm border border-border p-3"
              >
                <input type="hidden" name="techId" value={t.id} />
                <input name="name" defaultValue={t.name} aria-label="Name" required className={inputClass} />
                <input name="email" type="email" defaultValue={t.email} aria-label="Email" required className={inputClass} />
                <input name="phone" defaultValue={t.phone} aria-label="Phone" required className={`${inputClass} font-mono`} />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    name="intent"
                    value="save"
                    className="h-12 flex-1 rounded-sm border border-border bg-surface font-display uppercase tracking-wide"
                  >
                    Save
                  </button>
                  <button
                    type="submit"
                    name="intent"
                    value="delete"
                    className="h-12 rounded-sm border border-danger/50 px-4 font-display uppercase tracking-wide text-danger"
                  >
                    Delete
                  </button>
                </div>
              </form>
            </li>
          ))}
        </ul>
        <form
          action={saveTechRow}
          className="mt-3 flex flex-col gap-2 rounded-sm border border-dashed border-border p-3"
        >
          <p className="font-display text-xs uppercase tracking-widest text-text-muted">
            Add a tech
          </p>
          <input name="name" placeholder="Name" aria-label="New tech name" required className={inputClass} />
          <input name="email" type="email" placeholder="Email" aria-label="New tech email" required className={inputClass} />
          <input name="phone" placeholder="Phone" aria-label="New tech phone" required className={`${inputClass} font-mono`} />
          <button
            type="submit"
            className="h-12 rounded-sm bg-accent font-display font-semibold uppercase tracking-wide text-bg"
          >
            Add tech
          </button>
        </form>
      </section>

      {/* Biometric unlock */}
      <section className="mt-8">
        <h2 className="font-display text-xs uppercase tracking-widest text-text-muted">
          Biometric unlock
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Enrolled devices can skip the PIN pad with Face ID / Touch ID / fingerprint.
          The PIN still works everywhere as a fallback.
        </p>
        {credentials.length > 0 && (
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {credentials.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate">{c.deviceLabel}</p>
                  <p className="text-xs text-text-muted">
                    Enrolled {formatDate(c.createdAt)}
                  </p>
                </div>
                <form action={deleteCredential}>
                  <input type="hidden" name="id" value={c.id} />
                  <button
                    type="submit"
                    className="h-12 rounded-sm border border-danger/50 px-4 font-display text-sm uppercase tracking-wide text-danger"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <BiometricEnrollButton />
        </div>
      </section>

      {/* Locations */}
      {locations.length > 1 && (
        <section className="mt-8">
          <h2 className="font-display text-xs uppercase tracking-widest text-text-muted">
            Locations
          </h2>
          <ul className="mt-2 flex flex-col gap-3">
            {locations.map((l) => (
              <li key={l.id} className="rounded-sm border border-border p-3">
                <form action={updateLocation} className="flex flex-col gap-2">
                  <input type="hidden" name="id" value={l.id} />
                  <input name="name" defaultValue={l.name} aria-label="Name" required className={inputClass} />
                  <input name="address" defaultValue={l.address} aria-label="Address" required className={inputClass} />
                  <button
                    type="submit"
                    className="h-12 rounded-sm border border-border bg-surface font-display uppercase tracking-wide"
                  >
                    Save
                  </button>
                </form>

                {/* Tag print logo — uploadable per location, prints in B&W */}
                <div className="mt-4 border-t border-border pt-3">
                  <p className="font-display text-xs uppercase tracking-widest text-text-muted">
                    Tag print logo
                  </p>
                  <p className="mt-1 text-sm text-text-muted">
                    Shown in black &amp; white at the top of every QR tag for this location.
                  </p>
                  {/* Preview on white, grayscaled — a true preview of the sticker */}
                  <div className="mt-2 flex h-24 items-center justify-center rounded-sm border border-border bg-white p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={l.printLogoUrl ?? l.logoUrl}
                      alt={`${l.name} tag logo`}
                      className="h-full w-auto max-w-full object-contain grayscale"
                    />
                  </div>
                  <p className="mt-1 font-mono text-xs text-text-muted">
                    {l.printLogoUrl ? "Custom logo" : "Default logo"}
                  </p>
                  <CompressingForm action={uploadLocationPrintLogo} className="mt-2 flex flex-col gap-2">
                    <input type="hidden" name="id" value={l.id} />
                    <input
                      type="file"
                      name="logo"
                      accept="image/png,image/jpeg,image/webp,image/avif"
                      required
                      aria-label={`Upload tag logo for ${l.name}`}
                      className="text-sm text-text-muted file:mr-3 file:h-12 file:rounded-sm file:border file:border-border file:bg-surface file:px-4 file:font-display file:uppercase file:tracking-wide file:text-text"
                    />
                    <button
                      type="submit"
                      className="h-12 rounded-sm border border-border bg-surface font-display uppercase tracking-wide"
                    >
                      Upload logo
                    </button>
                  </CompressingForm>
                  {l.printLogoUrl && (
                    <form action={resetLocationPrintLogo} className="mt-2">
                      <input type="hidden" name="id" value={l.id} />
                      <button
                        type="submit"
                        className="h-12 w-full rounded-sm border border-border font-display uppercase tracking-wide text-text-muted"
                      >
                        Use default logo
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Settings */}
      <section className="mt-8">
        <h2 className="font-display text-xs uppercase tracking-widest text-text-muted">
          Settings
        </h2>
        <form
          action={updateAdminEmail}
          className="mt-2 flex flex-col gap-2 rounded-sm border border-border p-3"
        >
          <label
            htmlFor="adminEmail"
            className="font-display text-xs uppercase tracking-widest text-text-muted"
          >
            Admin email (part orders go here)
          </label>
          <input
            id="adminEmail"
            name="adminEmail"
            type="email"
            defaultValue={adminEmail?.value ?? ""}
            required
            className={inputClass}
          />
          <button
            type="submit"
            className="h-12 rounded-sm border border-border bg-surface font-display uppercase tracking-wide"
          >
            Save email
          </button>
        </form>

        <form
          action={changePin}
          className="mt-3 flex flex-col gap-2 rounded-sm border border-border p-3"
        >
          <p className="font-display text-xs uppercase tracking-widest text-text-muted">
            Change PIN
          </p>
          <label htmlFor="currentPin" className="sr-only">
            Current PIN
          </label>
          <input
            id="currentPin"
            name="currentPin"
            type="password"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            placeholder="Current PIN"
            required
            className={`${inputClass} font-mono`}
          />
          <label htmlFor="newPin" className="sr-only">
            New PIN
          </label>
          <input
            id="newPin"
            name="newPin"
            type="password"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            placeholder="New 6-digit PIN"
            required
            className={`${inputClass} font-mono`}
          />
          <button
            type="submit"
            className="h-12 rounded-sm border border-border bg-surface font-display uppercase tracking-wide"
          >
            Change PIN
          </button>
        </form>
      </section>
    </main>
  );
}
