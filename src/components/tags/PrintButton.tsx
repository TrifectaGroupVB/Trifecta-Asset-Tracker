"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="h-12 rounded-sm bg-accent px-5 font-display font-semibold uppercase tracking-wide text-bg print:hidden"
    >
      Print sheet
    </button>
  );
}
