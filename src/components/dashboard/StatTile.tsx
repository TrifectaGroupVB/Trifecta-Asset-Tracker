// Mini data-plate-styled stat tile for the dashboard strip.
export function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-border bg-surface p-1">
      <div className="flex flex-col items-center border border-border/70 px-2 py-3">
        <span className="font-mono text-2xl leading-none">{value}</span>
        <span className="mt-2 text-center font-display text-[10px] uppercase tracking-widest text-text-muted">
          {label}
        </span>
      </div>
    </div>
  );
}
