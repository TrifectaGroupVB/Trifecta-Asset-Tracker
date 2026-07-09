import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { prisma } from "@/lib/db";

// Lightweight index for when someone doesn't have the QR tag handy.
export default async function EquipmentIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const equipment = await prisma.equipment.findMany({
    where: query
      ? {
          OR: [{ name: { contains: query } }, { model: { contains: query } }],
        }
      : undefined,
    orderBy: { name: "asc" },
  });

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl p-4 pb-16">
        <h1 className="mt-2 font-display text-3xl font-semibold uppercase tracking-wide">
          Equipment
        </h1>

        <form action="/equipment" className="mt-4 flex gap-2">
          <label htmlFor="q" className="sr-only">
            Search by name or model
          </label>
          <input
            id="q"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search name or model…"
            className="h-12 min-w-0 flex-1 rounded-sm border border-border bg-surface px-3 text-text placeholder:text-text-muted"
          />
          <button
            type="submit"
            className="h-12 shrink-0 rounded-sm border border-border bg-surface px-4 font-display uppercase tracking-wide text-text"
          >
            Search
          </button>
        </form>

        {equipment.length === 0 ? (
          <p className="mt-8 text-text-muted">
            No equipment matches “{query}”.{" "}
            <Link href="/equipment" className="text-accent underline underline-offset-4">
              Clear search
            </Link>
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {equipment.map((eq) => (
              <li key={eq.id}>
                <Link
                  href={`/equipment/${eq.id}`}
                  className="flex min-h-12 items-center gap-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-lg font-semibold uppercase leading-tight tracking-wide">
                      {eq.name}
                    </p>
                    <p className="text-sm text-text-muted">
                      {eq.manufacturer}{" "}
                      <span className="font-mono whitespace-nowrap">{eq.model}</span>
                    </p>
                    <p className="text-sm text-text-muted">{eq.location}</p>
                  </div>
                  <span aria-hidden className="text-text-muted">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
