import Link from "next/link";
import { PinGate } from "@/components/dashboard/PinGate";
import { prisma } from "@/lib/db";
import { hasDashboardSession } from "@/lib/session";
import { saveTechRow } from "./actions";

const MESSAGES: Record<string, { text: string; kind: "ok" | "error" }> = {};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string; q?: string; location?: string }>;
}) {
  if (!(await hasDashboardSession())) return <PinGate />;

  const { error, ok, q, location: locationSlug } = await searchParams;
  const message = MESSAGES[error ?? ok ?? ""];
  const query = q?.trim() ?? "";

  const [equipment, techs, locations] = await Promise.all([
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

      {/* Everything else — PIN, biometrics, locations, email, feature
          switches — moved to /dashboard/settings. */}
      <section className="mt-8">
        <h2 className="font-display text-xs uppercase tracking-widest text-text-muted">
          Everything else
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          The dashboard PIN, biometric devices, locations, email notifications,
          and feature switches now live under Settings.
        </p>
        <Link
          href="/dashboard/settings"
          className="mt-3 flex h-12 w-full items-center justify-center rounded-sm border border-border bg-surface font-display uppercase tracking-wide"
        >
          Open Settings
        </Link>
      </section>
    </main>
  );
}
