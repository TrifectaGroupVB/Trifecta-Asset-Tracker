"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  importPartsFromManual,
  readPartsFromManual,
  type ReadPartsResult,
} from "@/app/dashboard/admin/parts-import-actions";
import type { PartCandidate } from "@/lib/partsExtract";

type Review = Extract<ReadPartsResult, { ok: true }>;
type Row = PartCandidate & { checked: boolean; alreadyAdded: boolean };

const inputClass =
  "h-12 w-full rounded-sm border border-border bg-surface px-3 placeholder:text-text-muted";
const fieldLabelClass =
  "block font-display text-[10px] uppercase tracking-widest text-text-muted";

export function PartsFromManual({ equipmentId }: { equipmentId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [manualTitle, setManualTitle] = useState("");
  const [attachManual, setAttachManual] = useState(true);
  const [result, setResult] = useState<string | null>(null);

  const selectedCount = useMemo(
    () => rows.filter((r) => r.checked).length,
    [rows]
  );

  async function read(formData: FormData) {
    setReading(true);
    setError(null);
    setResult(null);
    try {
      formData.set("equipmentId", equipmentId);
      const res = await readPartsFromManual(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const taken = new Set(res.existingPartNumbers.map((n) => n.toUpperCase()));
      setReview(res);
      setManualTitle(res.manualTitle);
      // Nothing pre-ticked: an OEM parts list runs long and most of it is
      // stuff nobody stocks. "Select all" is right there for the rare manual
      // that's worth taking wholesale.
      setRows(
        res.parts.map((p) => ({
          ...p,
          checked: false,
          alreadyAdded: taken.has(p.partNumber.toUpperCase()),
        }))
      );
    } catch {
      setError("Something went wrong reading that manual. Try again.");
    } finally {
      setReading(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("equipmentId", equipmentId);
      fd.set("manualUrl", review?.manualUrl ?? "");
      fd.set("manualTitle", manualTitle);
      if (attachManual) fd.set("attachManual", "on");
      fd.set(
        "parts",
        JSON.stringify(
          rows
            .filter((r) => r.checked)
            .map(({ name, partNumber, refNumber, qty }) => ({
              name,
              partNumber,
              refNumber,
              qty,
            }))
        )
      );
      const res = await importPartsFromManual(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setReview(null);
      setRows([]);
      formRef.current?.reset();
      setResult(
        `Added ${res.added} part${res.added === 1 ? "" : "s"}` +
          (res.skipped > 0 ? `, skipped ${res.skipped} already on this unit` : "") +
          (res.manualAttached ? ", and attached the manual." : ".")
      );
      router.refresh();
    } catch {
      setError("Something went wrong saving those parts. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function update(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  return (
    <details className="mt-3 rounded-sm border border-accent/40">
      <summary className="flex min-h-12 cursor-pointer list-none items-center px-3 font-display uppercase tracking-wide text-accent">
        Pull parts from manual
      </summary>

      <div className="border-t border-accent/30 p-3">
        {!review && (
          <>
            <p className="text-sm text-text-muted">
              Point it at the manual and it reads the parts list, then shows you
              everything it found so you can pick what to keep.
            </p>
            <form
              ref={formRef}
              className="mt-3 flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void read(new FormData(e.currentTarget));
              }}
            >
              <label htmlFor="import-url" className={fieldLabelClass}>
                Link to the manual PDF
              </label>
              {/* type="text", not type="url" — native URL validation silently
                  blocks submission on a scheme-less value, which is exactly
                  what the server-side normalizer is there to handle. */}
              <input
                id="import-url"
                name="url"
                type="text"
                placeholder="https://manufacturer.com/service-manual.pdf"
                className={inputClass}
              />
              <p className="text-center text-xs text-text-muted">— or —</p>
              <label htmlFor="import-file" className={fieldLabelClass}>
                Upload the PDF
              </label>
              <input
                id="import-file"
                type="file"
                name="file"
                accept="application/pdf"
                aria-label="Manual PDF to read parts from"
                className="text-sm text-text-muted file:mr-3 file:h-12 file:rounded-sm file:border file:border-border file:bg-surface file:px-4 file:font-display file:uppercase file:tracking-wide file:text-text"
              />
              <button
                type="submit"
                disabled={reading}
                className="h-12 rounded-sm bg-accent font-display font-semibold uppercase tracking-wide text-bg disabled:opacity-60"
              >
                {reading ? "Reading the manual…" : "Read manual"}
              </button>
              {reading && (
                <p className="text-xs text-text-muted">
                  A long manual can take a minute or two — leave this page open.
                </p>
              )}
            </form>
          </>
        )}

        {review && (
          <>
            <p className="font-display text-sm uppercase tracking-wide">
              Found {rows.length} part{rows.length === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Read pages {review.pagesRead.from}–{review.pagesRead.to} of{" "}
              {review.pageCount}.
              {review.pagesRead.from > 1 &&
                " Long manual — only the back end was read, where parts lists usually live. If the list is earlier, upload just those pages."}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setRows((prev) =>
                    prev.map((r) => ({ ...r, checked: !r.alreadyAdded }))
                  )
                }
                className="h-12 flex-1 rounded-sm border border-accent px-3 font-display uppercase tracking-wide text-accent"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() =>
                  setRows((prev) => prev.map((r) => ({ ...r, checked: false })))
                }
                className="h-12 rounded-sm border border-border px-4 font-display uppercase tracking-wide text-text-muted"
              >
                Clear
              </button>
            </div>

            <ul className="mt-3 flex max-h-[28rem] flex-col gap-2 overflow-y-auto">
              {rows.map((row, i) => (
                <li
                  key={`${row.partNumber}-${i}`}
                  className={`rounded-sm border p-2 ${
                    row.checked ? "border-accent/60" : "border-border/60"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={row.checked}
                      onChange={(e) => update(i, { checked: e.target.checked })}
                      aria-label={`Add ${row.name}`}
                      className="mt-3 size-6 shrink-0 accent-accent"
                    />
                    <div className="min-w-0 flex-1">
                      <label htmlFor={`imp-name-${i}`} className={fieldLabelClass}>
                        Part name
                      </label>
                      <input
                        id={`imp-name-${i}`}
                        value={row.name}
                        onChange={(e) => update(i, { name: e.target.value })}
                        className={inputClass}
                      />
                      <div className="mt-2 flex gap-2">
                        <div className="min-w-0 flex-1">
                          <label
                            htmlFor={`imp-number-${i}`}
                            className={fieldLabelClass}
                          >
                            Part #
                          </label>
                          <input
                            id={`imp-number-${i}`}
                            value={row.partNumber}
                            onChange={(e) =>
                              update(i, { partNumber: e.target.value })
                            }
                            className={`${inputClass} font-mono`}
                          />
                        </div>
                        <div className="w-20 shrink-0">
                          <label
                            htmlFor={`imp-ref-${i}`}
                            className={fieldLabelClass}
                          >
                            Ref #
                          </label>
                          <input
                            id={`imp-ref-${i}`}
                            value={row.refNumber ?? ""}
                            onChange={(e) =>
                              update(i, { refNumber: e.target.value || null })
                            }
                            className={`${inputClass} font-mono`}
                          />
                        </div>
                        <div className="w-16 shrink-0">
                          <label
                            htmlFor={`imp-qty-${i}`}
                            className={fieldLabelClass}
                          >
                            Qty
                          </label>
                          <input
                            id={`imp-qty-${i}`}
                            value={row.qty ?? ""}
                            onChange={(e) => update(i, { qty: e.target.value || null })}
                            className={`${inputClass} font-mono`}
                          />
                        </div>
                      </div>
                      {row.alreadyAdded && (
                        <p className="mt-1 text-xs text-text-muted">
                          Already on this unit — ticking it won&rsquo;t duplicate it.
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-3 border-t border-border pt-3">
              <label className="flex min-h-12 items-center gap-3">
                <input
                  type="checkbox"
                  checked={attachManual}
                  onChange={(e) => setAttachManual(e.target.checked)}
                  className="size-6 accent-accent"
                />
                <span className="text-sm">Also add this manual to the unit</span>
              </label>
              {attachManual && (
                <>
                  <label htmlFor="imp-manual-title" className={fieldLabelClass}>
                    Manual title
                  </label>
                  <input
                    id="imp-manual-title"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    className={inputClass}
                  />
                </>
              )}
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || selectedCount === 0}
                className="h-12 flex-1 rounded-sm bg-accent font-display font-semibold uppercase tracking-wide text-bg disabled:opacity-60"
              >
                {saving
                  ? "Adding…"
                  : `Add ${selectedCount} part${selectedCount === 1 ? "" : "s"}`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setReview(null);
                  setRows([]);
                }}
                className="h-12 rounded-sm border border-border px-4 font-display uppercase tracking-wide text-text-muted"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        {result && (
          <p className="mt-3 text-sm text-status-completed">{result}</p>
        )}
      </div>
    </details>
  );
}
