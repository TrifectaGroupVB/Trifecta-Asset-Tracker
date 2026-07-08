import Link from "next/link";
import { PinGate } from "@/components/dashboard/PinGate";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { hasDashboardSession } from "@/lib/session";
import { generateTagBatch, resetTagForReassign, voidTag } from "./actions";

function RoleBadge({ role, voided }: { role: string; voided: boolean }) {
  if (voided)
    return (
      <span className="inline-flex h-6 items-center rounded-sm border border-danger/60 px-2 font-display text-xs font-semibold uppercase tracking-widest text-danger">
        Voided
      </span>
    );
  const style =
    role === "UNASSIGNED"
      ? "border-accent text-accent"
      : role === "EQUIPMENT"
        ? "border-status-progress text-status-progress"
        : "border-status-assigned text-status-assigned";
  const label =
    role === "UNASSIGNED" ? "Blank" : role === "EQUIPMENT" ? "Equipment" : "Station";
  return (
    <span
      className={`inline-flex h-6 items-center rounded-sm border px-2 font-display text-xs font-semibold uppercase tracking-widest ${style}`}
    >
      {label}
    </span>
  );
}

export default async function TagsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  if (!(await hasDashboardSession())) return <PinGate />;

  const { filter } = await searchParams;
  const unassignedOnly = filter === "unassigned";

  const [tags, batches] = await Promise.all([
    prisma.tag.findMany({
      include: {
        equipment: { select: { id: true, name: true } },
        batch: { select: { batchNumber: true } },
      },
      orderBy: [{ batch: { batchNumber: "desc" } }, { code: "asc" }],
    }),
    prisma.tagBatch.findMany({ orderBy: { batchNumber: "desc" } }),
  ]);

  const blanks = tags.filter((t) => t.role === "UNASSIGNED" && !t.voided);
  const visible = unassignedOnly
    ? tags.filter((t) => t.role === "UNASSIGNED" && !t.voided)
    : tags;

  return (
    <main className="p-4 pb-16">
      <h1 className="font-display text-3xl font-semibold uppercase tracking-wide">
        Tags
      </h1>
      <p className="mt-1 text-sm text-text-muted">
        {blanks.length} blank {blanks.length === 1 ? "sticker" : "stickers"} left in
        circulation.
      </p>

      <form
        action={generateTagBatch}
        className="mt-4 flex items-end gap-2 rounded-sm border border-border p-3"
      >
        <div className="flex-1">
          <label
            htmlFor="count"
            className="font-display text-xs uppercase tracking-widest text-text-muted"
          >
            Stickers per batch
          </label>
          <input
            id="count"
            name="count"
            type="number"
            min={1}
            max={100}
            defaultValue={20}
            className="mt-1 h-12 w-full rounded-sm border border-border bg-surface px-3 font-mono"
          />
        </div>
        <button
          type="submit"
          className="h-12 shrink-0 rounded-sm bg-accent px-4 font-display font-semibold uppercase tracking-wide text-bg"
        >
          Generate batch
        </button>
      </form>

      {batches.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {batches.map((b) => (
            <Link
              key={b.id}
              href={`/dashboard/tags/print/${b.batchNumber}`}
              className="flex h-12 items-center rounded-sm border border-border px-3 font-display text-sm uppercase tracking-wide text-text-muted"
            >
              Print batch #{b.batchNumber}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <h2 className="font-display text-xs uppercase tracking-widest text-text-muted">
          All tags
        </h2>
        <Link
          href={unassignedOnly ? "/dashboard/tags" : "/dashboard/tags?filter=unassigned"}
          className={`flex h-12 items-center rounded-sm border px-3 font-display text-sm uppercase tracking-wide ${
            unassignedOnly ? "border-accent text-accent" : "border-border text-text-muted"
          }`}
        >
          {unassignedOnly ? "Showing blanks" : "Blanks only"}
        </Link>
      </div>

      {visible.length === 0 ? (
        <p className="mt-4 text-text-muted">
          {tags.length === 0
            ? "No tags yet — generate a batch above to get started."
            : "No blank tags left — generate a new batch above."}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border border-y border-border">
          {visible.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
              <span className="font-mono text-sm whitespace-nowrap">{t.code}</span>
              <RoleBadge role={t.role} voided={t.voided} />
              <span className="min-w-0 flex-1 truncate text-sm text-text-muted">
                {t.role === "EQUIPMENT" && t.equipment ? (
                  <Link
                    href={`/equipment/${t.equipment.id}`}
                    className="inline-flex min-h-12 items-center text-text underline underline-offset-4"
                  >
                    {t.equipment.name}
                  </Link>
                ) : t.role === "SERVICE_REQUEST" ? (
                  (t.label ?? "Request station")
                ) : (
                  "—"
                )}
              </span>
              <span className="font-mono text-xs text-text-muted">
                #{t.batch.batchNumber}
              </span>
              <span className="font-mono text-xs text-text-muted">
                {t.assignedAt ? formatDate(t.assignedAt) : ""}
              </span>
              <span className="flex gap-1">
                {!t.voided && t.role !== "UNASSIGNED" && (
                  <form action={resetTagForReassign}>
                    <input type="hidden" name="tagId" value={t.id} />
                    <button
                      type="submit"
                      className="flex h-12 items-center rounded-sm border border-border px-3 font-display text-xs uppercase tracking-wide text-text-muted"
                    >
                      Reassign
                    </button>
                  </form>
                )}
                <form action={voidTag}>
                  <input type="hidden" name="tagId" value={t.id} />
                  <input type="hidden" name="voided" value={t.voided ? "false" : "true"} />
                  <button
                    type="submit"
                    className={`flex h-12 items-center rounded-sm border px-3 font-display text-xs uppercase tracking-wide ${
                      t.voided
                        ? "border-border text-text-muted"
                        : "border-danger/50 text-danger"
                    }`}
                  >
                    {t.voided ? "Restore" : "Void"}
                  </button>
                </form>
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
