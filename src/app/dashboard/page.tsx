import Image from "next/image";
import Link from "next/link";
import { StatusBadge, UrgencyBadge } from "@/components/badges";
import { PinGate } from "@/components/dashboard/PinGate";
import { StatTile } from "@/components/dashboard/StatTile";
import { STATUSES, STATUS_LABELS, type Status } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { formatAge, formatDuration, formatRequestNumber } from "@/lib/format";
import { hasDashboardSession } from "@/lib/session";

const FOUR_HOURS_MS = 4 * 3_600_000;

export default async function DashboardQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; location?: string }>;
}) {
  if (!(await hasDashboardSession())) return <PinGate />;

  const {
    status: statusParam = "ALL",
    q = "",
    location: locationParam = "ALL",
  } = await searchParams;
  const statusFilter = (STATUSES as readonly string[]).includes(statusParam)
    ? (statusParam as Status)
    : "ALL";

  const [all, locations] = await Promise.all([
    prisma.serviceRequest.findMany({
      include: {
        equipment: {
          select: { id: true, name: true, restaurant: { select: { slug: true, name: true } } },
        },
        tech: true,
      },
    }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
  ]);
  const locationFilter =
    locationParam === "ALL" || locations.some((l) => l.slug === locationParam)
      ? locationParam
      : "ALL";

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const openCount = all.filter((r) => r.status === "OPEN").length;
  const urgentCount = all.filter(
    (r) => r.urgency === "URGENT" && r.status !== "COMPLETED"
  ).length;
  const completedThisMonth = all.filter(
    (r) => r.completedAt && r.completedAt >= monthStart
  );
  const avgCompletion =
    completedThisMonth.length > 0
      ? formatDuration(
          completedThisMonth.reduce(
            (sum, r) => sum + (r.completedAt!.getTime() - r.createdAt.getTime()),
            0
          ) / completedThisMonth.length
        )
      : "—";

  const query = q.trim().toLowerCase();
  const queryNumber = /^(?:sr-?)?0*(\d+)$/i.exec(query)?.[1];
  const requests = all
    .filter((r) => (statusFilter === "ALL" ? true : r.status === statusFilter))
    .filter((r) =>
      locationFilter === "ALL" ? true : r.equipment.restaurant.slug === locationFilter
    )
    .filter((r) => {
      if (!query) return true;
      if (r.equipment.name.toLowerCase().includes(query)) return true;
      if (queryNumber && r.requestNumber === Number(queryNumber)) return true;
      return false;
    })
    .sort(
      (a, b) =>
        Number(b.urgency === "URGENT") - Number(a.urgency === "URGENT") ||
        a.createdAt.getTime() - b.createdAt.getTime()
    );

  const chips: { key: string; label: string }[] = [
    { key: "ALL", label: "All" },
    ...STATUSES.map((s) => ({ key: s, label: STATUS_LABELS[s] })),
  ];

  function withParams(overrides: Record<string, string>): string {
    const params = new URLSearchParams();
    const status = overrides.status ?? statusFilter;
    const location = overrides.location ?? locationFilter;
    if (status !== "ALL") params.set("status", status);
    if (location !== "ALL") params.set("location", location);
    if (query) params.set("q", q);
    const qs = params.toString();
    return qs ? `/dashboard?${qs}` : "/dashboard";
  }

  return (
    <main className="p-4 pb-16">
      <h1 className="sr-only">Service request queue</h1>

      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Open" value={String(openCount)} />
        <StatTile label="Urgent" value={String(urgentCount)} />
        <StatTile label="Avg completion" value={avgCompletion} />
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {chips.map((c) => {
          const active = statusFilter === c.key;
          return (
            <Link
              key={c.key}
              href={withParams({ status: c.key })}
              className={`flex h-12 shrink-0 items-center rounded-sm border px-3 font-display text-sm uppercase tracking-wide ${
                active
                  ? "border-accent text-accent"
                  : "border-border text-text-muted"
              }`}
            >
              {c.label}
            </Link>
          );
        })}
      </div>

      {locations.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {[{ slug: "ALL", name: "All locations" }, ...locations].map((l) => {
            const active = locationFilter === l.slug;
            return (
              <Link
                key={l.slug}
                href={withParams({ location: l.slug })}
                className={`flex h-9 shrink-0 items-center rounded-sm border px-2.5 font-display text-xs uppercase tracking-wide ${
                  active
                    ? "border-accent text-accent"
                    : "border-border text-text-muted"
                }`}
              >
                {l.name}
              </Link>
            );
          })}
        </div>
      )}

      <form action="/dashboard" className="mt-3 flex gap-2">
        {statusFilter !== "ALL" && (
          <input type="hidden" name="status" value={statusFilter} />
        )}
        {locationFilter !== "ALL" && (
          <input type="hidden" name="location" value={locationFilter} />
        )}
        <label htmlFor="q" className="sr-only">
          Search by equipment or SR number
        </label>
        <input
          id="q"
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search equipment or SR-#…"
          className="h-12 min-w-0 flex-1 rounded-sm border border-border bg-surface px-3 placeholder:text-text-muted"
        />
        <button
          type="submit"
          className="h-12 shrink-0 rounded-sm border border-border bg-surface px-4 font-display uppercase tracking-wide"
        >
          Search
        </button>
      </form>

      {requests.length === 0 ? (
        <p className="mt-8 text-text-muted">No requests match.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {requests.map((r) => {
            const overdue =
              r.urgency === "URGENT" &&
              r.status === "OPEN" &&
              now.getTime() - r.createdAt.getTime() > FOUR_HOURS_MS;
            return (
              <li key={r.id}>
                <Link
                  href={`/dashboard/requests/${r.id}`}
                  className="flex items-start gap-3 py-3"
                >
                  {r.photoUrl ? (
                    <Image
                      src={r.photoUrl}
                      alt=""
                      width={56}
                      height={56}
                      className="size-14 shrink-0 rounded-sm border border-border object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="flex size-14 shrink-0 items-center justify-center rounded-sm border border-border bg-surface font-display text-xs uppercase text-text-muted"
                    >
                      No photo
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2">
                      <span className="font-mono text-sm">
                        {formatRequestNumber(r.requestNumber)}
                      </span>
                      <span className="truncate font-display font-semibold uppercase tracking-wide">
                        {r.equipment.name}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-sm text-text-muted">
                      {r.description}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2">
                      <UrgencyBadge urgency={r.urgency as never} pulse={overdue} />
                      <StatusBadge status={r.status as never} />
                      {locations.length > 1 && (
                        <span className="font-display text-xs uppercase tracking-widest text-text-muted">
                          {r.equipment.restaurant.name}
                        </span>
                      )}
                      <span className="text-xs text-text-muted">
                        {formatAge(r.createdAt, now)}
                      </span>
                      <span
                        className={`font-display text-xs uppercase tracking-widest ${
                          r.tech ? "text-text-muted" : "text-accent"
                        }`}
                      >
                        {r.tech ? r.tech.name : "Unassigned"}
                      </span>
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
