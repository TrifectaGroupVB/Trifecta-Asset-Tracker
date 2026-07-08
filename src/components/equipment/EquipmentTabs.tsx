"use client";

import { useState } from "react";
import { DataPlate } from "@/components/DataPlate";
import {
  submitPartOrder,
} from "@/app/equipment/[id]/actions";
import { formatOrderNumber, formatPrice } from "@/lib/format";

type SpecField = { id: string; label: string; value: string };
type Manual = { id: string; title: string; fileUrl: string; sizeLabel: string };
type Part = { id: string; name: string; partNumber: string; price: number | null };
type ServiceRecordRow = {
  id: string;
  date: string;
  techName: string;
  workPerformed: string;
  partsUsed: string | null;
};

const TABS = ["OVERVIEW", "MANUALS", "PARTS", "HISTORY"] as const;
type Tab = (typeof TABS)[number];

function PdfIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-6 shrink-0 text-text-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M6 2.75h8.5L20 8.25V21.25H6z" strokeLinejoin="round" />
      <path d="M14.5 2.75v5.5H20" strokeLinejoin="round" />
      <text
        x="12.8"
        y="17.5"
        textAnchor="middle"
        fontSize="6"
        fill="currentColor"
        stroke="none"
        fontFamily="inherit"
      >
        PDF
      </text>
    </svg>
  );
}

export function EquipmentTabs({
  equipmentId,
  equipmentName,
  specFields,
  manuals,
  parts,
  records,
}: {
  equipmentId: string;
  equipmentName: string;
  specFields: SpecField[];
  manuals: Manual[];
  parts: Part[];
  records: ServiceRecordRow[];
}) {
  const [tab, setTab] = useState<Tab>("OVERVIEW");
  const [view, setView] = useState<"tabs" | "review" | "confirmed">("tabs");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [requesterName, setRequesterName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<number | null>(null);

  const selected = parts.filter((p) => (qty[p.id] ?? 0) > 0);
  const totalQty = selected.reduce((sum, p) => sum + qty[p.id], 0);

  function bump(partId: string, delta: number) {
    setQty((prev) => {
      const next = Math.max(0, Math.min(99, (prev[partId] ?? 0) + delta));
      return { ...prev, [partId]: next };
    });
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitPartOrder({
        equipmentId,
        requesterName,
        lines: selected.map((p) => ({ partId: p.id, qty: qty[p.id] })),
      });
      if (result.ok) {
        setOrderNumber(result.orderNumber);
        setView("confirmed");
        window.scrollTo(0, 0);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Something went wrong sending the order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (view === "confirmed" && orderNumber != null) {
    return (
      <div className="p-4">
        <DataPlate
          title="Order Sent"
          subtitle="Part Order"
          badge={
            <span className="font-mono text-sm text-accent">
              {formatOrderNumber(orderNumber)}
            </span>
          }
          fields={[
            { label: "Order No.", value: formatOrderNumber(orderNumber) },
            { label: "Requested By", value: requesterName, mono: false },
            { label: "Equipment", value: equipmentName, mono: false, wide: true },
            ...selected.map((p) => ({
              label: p.name,
              value: `${p.partNumber} x${qty[p.id]}`,
            })),
          ]}
          stamp="The admin has been emailed this order"
        />
        <button
          type="button"
          onClick={() => {
            setQty({});
            setRequesterName("");
            setOrderNumber(null);
            setView("tabs");
            setTab("OVERVIEW");
            window.scrollTo(0, 0);
          }}
          className="mt-4 h-12 w-full rounded-sm bg-accent font-display text-lg font-semibold uppercase tracking-wide text-bg"
        >
          Back to Equipment
        </button>
      </div>
    );
  }

  if (view === "review") {
    return (
      <div className="p-4">
        <button
          type="button"
          onClick={() => setView("tabs")}
          className="flex min-h-12 items-center font-display uppercase tracking-wide text-text-muted"
        >
          ‹ Back to parts
        </button>
        <h2 className="font-display text-2xl font-semibold uppercase tracking-wide">
          Review Order
        </h2>

        <ul className="mt-3 divide-y divide-border border-y border-border">
          {selected.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm">{p.name}</p>
                <p className="font-mono text-xs text-text-muted whitespace-nowrap">
                  {p.partNumber}
                </p>
              </div>
              <span className="font-mono text-base">x{qty[p.id]}</span>
            </li>
          ))}
        </ul>

        <form
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          <label
            htmlFor="requesterName"
            className="font-display text-xs uppercase tracking-widest text-text-muted"
          >
            Your name
          </label>
          <input
            id="requesterName"
            type="text"
            required
            value={requesterName}
            onChange={(e) => setRequesterName(e.target.value)}
            placeholder="Who's requesting this?"
            className="mt-1 h-12 w-full rounded-sm border border-border bg-surface px-3 text-text placeholder:text-text-muted"
          />
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="mt-4 h-12 w-full rounded-sm bg-accent font-display text-lg font-semibold uppercase tracking-wide text-bg disabled:opacity-60"
          >
            {submitting
              ? "Sending…"
              : `Send order — ${totalQty} ${totalQty === 1 ? "part" : "parts"}`}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Equipment sections"
        className="sticky top-0 z-20 grid grid-cols-4 border-y border-border bg-bg"
      >
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`h-12 font-display text-sm font-semibold uppercase tracking-wide ${
              tab === t
                ? "border-b-2 border-accent text-accent"
                : "text-text-muted"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "OVERVIEW" && (
        <dl className="p-4">
          {specFields.length === 0 && (
            <p className="text-text-muted">No spec fields recorded.</p>
          )}
          {specFields.map((s) => (
            <div
              key={s.id}
              className="grid grid-cols-[40%_1fr] gap-3 border-b border-border py-3"
            >
              <dt className="font-display text-xs uppercase tracking-widest text-text-muted self-center">
                {s.label}
              </dt>
              {/* Values that contain a digit are treated as numbers/codes → mono */}
              <dd className={`text-sm ${/\d/.test(s.value) ? "font-mono" : ""}`}>
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {tab === "MANUALS" && (
        <ul className="divide-y divide-border p-4">
          {manuals.length === 0 && (
            <li className="text-text-muted">
              No manuals yet — upload one from the admin dashboard.
            </li>
          )}
          {manuals.map((m) => (
            <li key={m.id}>
              <a
                href={m.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-12 items-center gap-3 py-3"
              >
                <PdfIcon />
                <span className="min-w-0 flex-1 text-sm">{m.title}</span>
                <span className="shrink-0 font-mono text-xs text-text-muted">
                  {m.sizeLabel}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {tab === "PARTS" && (
        <div className={totalQty > 0 ? "p-4 pb-28" : "p-4"}>
          <ul className="divide-y divide-border">
            {parts.length === 0 && (
              <li className="text-text-muted">
                No parts on file yet — add them from the admin dashboard.
              </li>
            )}
            {parts.map((p) => {
              const n = qty[p.id] ?? 0;
              return (
                <li key={p.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{p.name}</p>
                    <p className="font-mono text-xs text-text-muted whitespace-nowrap">
                      {p.partNumber}
                    </p>
                    {p.price != null && (
                      <p className="font-mono text-xs text-text-muted">
                        {formatPrice(p.price)}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center rounded-sm border border-border">
                    <button
                      type="button"
                      onClick={() => bump(p.id, -1)}
                      disabled={n === 0}
                      aria-label={`Remove one ${p.name}`}
                      className="size-12 text-xl text-text disabled:text-text-muted/50"
                    >
                      −
                    </button>
                    <span
                      aria-live="polite"
                      className={`w-8 text-center font-mono text-base ${
                        n > 0 ? "text-accent" : "text-text-muted"
                      }`}
                    >
                      {n}
                    </span>
                    <button
                      type="button"
                      onClick={() => bump(p.id, 1)}
                      aria-label={`Add one ${p.name}`}
                      className="size-12 text-xl text-text"
                    >
                      +
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {totalQty > 0 && (
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface p-3">
              <div className="mx-auto max-w-2xl">
                <button
                  type="button"
                  onClick={() => {
                    setView("review");
                    window.scrollTo(0, 0);
                  }}
                  className="h-12 w-full rounded-sm bg-accent font-display text-lg font-semibold uppercase tracking-wide text-bg"
                >
                  {totalQty} {totalQty === 1 ? "part" : "parts"} — Review Order
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "HISTORY" && (
        <div className="p-4">
          {records.length === 0 ? (
            <p className="text-text-muted">No service history yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {records.map((r) => (
                <li key={r.id} className="py-3">
                  <p className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-xs text-text-muted">
                      {r.date}
                    </span>
                    <span className="font-display text-xs uppercase tracking-widest text-text-muted">
                      {r.techName}
                    </span>
                  </p>
                  <p className="mt-1 text-sm">{r.workPerformed}</p>
                  {r.partsUsed && (
                    <p className="mt-1 font-mono text-xs text-text-muted">
                      Parts: {r.partsUsed}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
