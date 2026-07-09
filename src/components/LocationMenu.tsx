"use client";

import { useEffect, useRef, useState } from "react";
import { selectLocation } from "@/app/location-actions";

type LocationOption = { id: string; slug: string; name: string };

function MenuIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
    </svg>
  );
}

export function LocationMenu({
  locations,
  currentLocationId,
}: {
  locations: LocationOption[];
  currentLocationId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape — a dropdown that only closes by
  // re-clicking its own button is annoying on a phone.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="absolute right-3 top-3 z-20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch location"
        className="flex size-12 items-center justify-center rounded-sm border border-border text-text-muted"
      >
        <MenuIcon />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] w-56 overflow-hidden rounded-sm border border-border bg-surface"
        >
          {/* Plain form-per-item submission — a cookie-mutating Server
              Action here triggers a same-response re-render of the route,
              but that re-render reconciles into this component in place
              rather than remounting it, so "open" isn't reset for free.
              Closing on click (rather than waiting on the action's result)
              closes it the instant it's tapped and sidesteps that entirely. */}
          {locations.map((l) => (
            <form key={l.id} action={selectLocation}>
              <input type="hidden" name="slug" value={l.slug} />
              <button
                type="submit"
                role="menuitem"
                onClick={() => setOpen(false)}
                className={`flex min-h-12 w-full items-center border-b border-border/50 px-3 text-left font-display text-sm uppercase tracking-wide last:border-b-0 ${
                  l.id === currentLocationId ? "text-accent" : "text-text"
                }`}
              >
                {l.name}
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
