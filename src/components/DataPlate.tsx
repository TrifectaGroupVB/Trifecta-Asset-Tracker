import Image from "next/image";
import type { ReactNode } from "react";

export type DataPlateField = {
  label: string;
  value: ReactNode;
  /** Values default to mono (model/serial/part numbers). Set false for prose. */
  mono?: boolean;
  /** Span the full width of the plate. */
  wide?: boolean;
};

type DataPlateProps = {
  title: string;
  subtitle?: string;
  /** Equipment photo shown at the top of the plate. Omitted when null. */
  photoUrl?: string | null;
  fields: DataPlateField[];
  /** Optional slot at the top right of the plate, e.g. a status chip. */
  badge?: ReactNode;
  /** Small stamped line at the bottom edge of the plate. */
  stamp?: string;
  className?: string;
};

function Rivet({ position }: { position: string }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute size-2 rounded-full bg-linear-to-br from-text-muted/60 via-border to-bg inset-shadow-sm ${position}`}
    />
  );
}

/**
 * The "data plate" — a panel styled like a machine rating plate. The one
 * decorative flourish in the app; used for equipment page headers and
 * wizard confirmations.
 */
export function DataPlate({
  title,
  subtitle,
  photoUrl,
  fields,
  badge,
  stamp,
  className = "",
}: DataPlateProps) {
  // With an odd field count, stretch the last cell so the plate stays a
  // solid rectangle instead of leaving a hole in the grid.
  const narrowCount = fields.filter((f) => !f.wide).length;
  const lastIndex = fields.length - 1;

  return (
    <section
      className={`relative rounded-sm border border-border bg-surface p-2.5 ${className}`}
    >
      <Rivet position="top-1 left-1" />
      <Rivet position="top-1 right-1" />
      <Rivet position="bottom-1 left-1" />
      <Rivet position="bottom-1 right-1" />

      <div className="border border-border/70 px-4 py-3 sm:px-5 sm:py-4">
        {photoUrl && (
          <div className="relative mb-3 aspect-video overflow-hidden border border-border/70 bg-bg">
            <Image
              src={photoUrl}
              alt={title}
              fill
              sizes="(max-width: 672px) 100vw, 672px"
              className="object-cover"
            />
          </div>
        )}
        <header className="flex items-start justify-between gap-3">
          <div>
            {subtitle && (
              <p className="font-display text-xs uppercase tracking-widest text-text-muted">
                {subtitle}
              </p>
            )}
            <h2 className="font-display text-2xl font-semibold uppercase leading-tight tracking-wide text-text sm:text-3xl">
              {title}
            </h2>
          </div>
          {badge && <div className="shrink-0">{badge}</div>}
        </header>

        <dl className="mt-3 grid grid-cols-2 gap-px border border-border/70 bg-border/70">
          {fields.map((field, i) => {
            const stretchLast =
              i === lastIndex && !field.wide && narrowCount % 2 === 1;
            return (
              <div
                key={`${field.label}-${i}`}
                className={`bg-surface px-3 py-2 ${
                  field.wide || stretchLast ? "col-span-2" : ""
                }`}
              >
                <dt className="font-display text-[11px] uppercase tracking-widest text-text-muted">
                  {field.label}
                </dt>
                <dd
                  className={`mt-0.5 text-sm text-text ${
                    field.mono === false ? "" : "font-mono"
                  }`}
                >
                  {field.value}
                </dd>
              </div>
            );
          })}
        </dl>

        {stamp && (
          <p className="mt-3 text-center font-display text-[10px] uppercase tracking-[0.25em] text-text-muted">
            {stamp}
          </p>
        )}
      </div>
    </section>
  );
}
