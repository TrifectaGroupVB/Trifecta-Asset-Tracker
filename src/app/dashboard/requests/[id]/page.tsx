import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge, UrgencyBadge } from "@/components/badges";
import { DataPlate } from "@/components/DataPlate";
import { PinGate } from "@/components/dashboard/PinGate";
import { prisma } from "@/lib/db";
import {
  formatAge,
  formatDateTime,
  formatRequestNumber,
} from "@/lib/format";
import { hasDashboardSession } from "@/lib/session";
import { addNote, assignTech, completeRequest, startWork } from "./actions";

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await hasDashboardSession())) return <PinGate />;

  const { id } = await params;
  const request = await prisma.serviceRequest.findUnique({
    where: { id },
    include: {
      equipment: { include: { restaurant: true } },
      tech: true,
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!request) notFound();

  const [techs, locationCount] = await Promise.all([
    prisma.tech.findMany({ orderBy: { name: "asc" } }),
    prisma.location.count(),
  ]);
  const statusEvents = request.events.filter((e) => e.kind === "STATUS");
  const notes = request.events.filter((e) => e.kind === "NOTE");

  return (
    <main className="p-4 pb-16">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="font-mono text-2xl">
          {formatRequestNumber(request.requestNumber)}
        </h1>
        <UrgencyBadge urgency={request.urgency as never} />
        <StatusBadge status={request.status as never} />
      </header>
      <p className="mt-1 text-sm text-text-muted">
        {request.requesterName} · {formatAge(request.createdAt)}
      </p>

      {/* Equipment summary plate → equipment page */}
      <Link href={`/equipment/${request.equipment.id}`} className="mt-4 block">
        <DataPlate
          title={request.equipment.name}
          subtitle={request.equipment.manufacturer}
          badge={<span className="text-sm text-accent">View →</span>}
          fields={[
            ...(locationCount > 1
              ? [
                  {
                    label: "Restaurant",
                    value: request.equipment.restaurant.name,
                    mono: false,
                  },
                ]
              : []),
            { label: "Model", value: request.equipment.model },
            { label: "Location", value: request.equipment.location, mono: false },
          ]}
        />
      </Link>

      <section className="mt-5">
        <h2 className="font-display text-xs uppercase tracking-widest text-text-muted">
          Problem
        </h2>
        <p className="mt-1 whitespace-pre-wrap">{request.description}</p>
        {request.photoUrl && (
          <div className="relative mt-3 aspect-video overflow-hidden rounded-sm border border-border bg-surface">
            <Image
              src={request.photoUrl}
              alt={`Photo for ${formatRequestNumber(request.requestNumber)}`}
              fill
              sizes="(max-width: 672px) 100vw, 672px"
              className="object-contain"
            />
          </div>
        )}
      </section>

      {/* Assignment */}
      <section className="mt-6">
        <h2 className="font-display text-xs uppercase tracking-widest text-text-muted">
          Assigned tech
        </h2>
        {request.tech ? (
          <p className="mt-1">
            {request.tech.name}{" "}
            <a
              href={`tel:${request.tech.phone}`}
              className="ml-1 inline-flex min-h-12 items-center px-2 align-middle font-mono text-sm text-accent underline underline-offset-4"
            >
              {request.tech.phone}
            </a>
          </p>
        ) : (
          <p className="mt-1 font-display uppercase tracking-widest text-accent">
            Unassigned
          </p>
        )}
        {request.status !== "COMPLETED" && (
          <details className="mt-2 rounded-sm border border-border bg-surface">
            <summary className="flex min-h-12 cursor-pointer list-none items-center px-3 font-display uppercase tracking-wide text-accent">
              {request.tech ? "Reassign" : "Assign a tech"}
            </summary>
            <ul className="border-t border-border">
              {techs.length === 0 && (
                <li className="px-3 py-3 text-sm text-text-muted">
                  No techs yet — add one in Admin.
                </li>
              )}
              {techs.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-3 border-b border-border/50 px-3 py-2 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p>{t.name}</p>
                    <p className="font-mono text-xs text-text-muted">{t.phone}</p>
                  </div>
                  <form action={assignTech}>
                    <input type="hidden" name="requestId" value={request.id} />
                    <input type="hidden" name="techId" value={t.id} />
                    <button
                      type="submit"
                      className="h-12 rounded-sm border border-accent px-4 font-display uppercase tracking-wide text-accent"
                    >
                      Assign
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* Status controls */}
      {request.status === "ASSIGNED" && (
        <form action={startWork} className="mt-6">
          <input type="hidden" name="requestId" value={request.id} />
          <button
            type="submit"
            className="h-12 w-full rounded-sm border border-status-progress font-display text-lg font-semibold uppercase tracking-wide text-status-progress"
          >
            Start work
          </button>
        </form>
      )}

      {request.status === "IN_PROGRESS" && (
        <details className="mt-6 rounded-sm border border-status-completed/60 bg-surface">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-center px-3 font-display text-lg font-semibold uppercase tracking-wide text-status-completed">
            Mark completed
          </summary>
          <form action={completeRequest} className="border-t border-border p-3">
            <input type="hidden" name="requestId" value={request.id} />
            <label
              htmlFor="workPerformed"
              className="font-display text-xs uppercase tracking-widest text-text-muted"
            >
              Work performed (required)
            </label>
            <textarea
              id="workPerformed"
              name="workPerformed"
              required
              rows={3}
              placeholder="What was done?"
              className="mt-1 w-full rounded-sm border border-border bg-bg px-3 py-2 placeholder:text-text-muted"
            />
            <label
              htmlFor="partsUsed"
              className="mt-3 block font-display text-xs uppercase tracking-widest text-text-muted"
            >
              Parts used (optional)
            </label>
            <input
              id="partsUsed"
              name="partsUsed"
              type="text"
              placeholder="e.g. Thermopile 8100162"
              className="mt-1 h-12 w-full rounded-sm border border-border bg-bg px-3 placeholder:text-text-muted"
            />
            <button
              type="submit"
              className="mt-4 h-12 w-full rounded-sm bg-status-completed font-display text-lg font-semibold uppercase tracking-wide text-bg"
            >
              Save &amp; complete
            </button>
          </form>
        </details>
      )}

      {/* Timeline */}
      <section className="mt-8">
        <h2 className="font-display text-xs uppercase tracking-widest text-text-muted">
          Timeline
        </h2>
        <ol className="mt-2 border-l border-border pl-4">
          <li className="relative py-1.5">
            <span className="absolute -left-[21px] top-3 size-2 rounded-full bg-border" />
            <p className="text-sm">
              Created by {request.requesterName}
              <span className="ml-2 font-mono text-xs text-text-muted">
                {formatDateTime(request.createdAt)}
              </span>
            </p>
          </li>
          {statusEvents.map((e) => (
            <li key={e.id} className="relative py-1.5">
              <span className="absolute -left-[21px] top-3 size-2 rounded-full bg-border" />
              <p className="text-sm">
                {e.text}
                <span className="ml-2 font-mono text-xs text-text-muted">
                  {formatDateTime(e.createdAt)}
                </span>
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* Internal notes */}
      <section className="mt-8">
        <h2 className="font-display text-xs uppercase tracking-widest text-text-muted">
          Internal notes
        </h2>
        {notes.length === 0 ? (
          <p className="mt-1 text-sm text-text-muted">No notes yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {notes.map((n) => (
              <li key={n.id} className="py-2">
                <p className="text-sm whitespace-pre-wrap">{n.text}</p>
                <p className="mt-0.5 font-mono text-xs text-text-muted">
                  {formatDateTime(n.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
        <form action={addNote} className="mt-3 flex gap-2">
          <input type="hidden" name="requestId" value={request.id} />
          <label htmlFor="note" className="sr-only">
            Add a note
          </label>
          <input
            id="note"
            name="text"
            type="text"
            required
            placeholder="Add a note…"
            className="h-12 min-w-0 flex-1 rounded-sm border border-border bg-surface px-3 placeholder:text-text-muted"
          />
          <button
            type="submit"
            className="h-12 shrink-0 rounded-sm border border-border bg-surface px-4 font-display uppercase tracking-wide"
          >
            Add
          </button>
        </form>
      </section>
    </main>
  );
}
