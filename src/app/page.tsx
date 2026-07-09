import Image from "next/image";
import Link from "next/link";
import { selectLocation } from "@/app/location-actions";
import { resolveLocation } from "@/lib/location";

const LINKS = [
  { href: "/equipment", label: "Equipment", sub: "Browse every unit" },
  { href: "/request", label: "Report a problem", sub: "File a service request" },
  { href: "/dashboard", label: "Dashboard", sub: "Staff only — PIN required" },
];

// Short button labels for the toggle — full legal names are too long for a
// corner pill (e.g. "The Shack on 8th" → "Shack").
const SHORT_LABEL: Record<string, string> = {
  watermans: "Waterman's",
  chix: "Chix",
  shack: "Shack",
};

export default async function Home() {
  const { location, locations } = await resolveLocation();

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-8 p-6">
      {locations.length > 1 && (
        <div className="absolute right-3 top-3 flex gap-1">
          {locations.map((l) => (
            <form key={l.id} action={selectLocation}>
              <input type="hidden" name="slug" value={l.slug} />
              <button
                type="submit"
                className={`flex h-9 items-center rounded-sm border px-2.5 font-display text-xs font-semibold uppercase tracking-wide ${
                  location?.id === l.id
                    ? "border-accent text-accent"
                    : "border-border text-text-muted"
                }`}
              >
                {SHORT_LABEL[l.slug] ?? l.name}
              </button>
            </form>
          ))}
        </div>
      )}

      {location && (
        <div className="relative aspect-square w-full max-w-xs">
          <Image
            src={location.logoUrl}
            alt={location.name}
            fill
            priority
            className="object-contain"
          />
        </div>
      )}

      <div className="w-full text-center">
        <h1 className="font-display text-3xl font-semibold uppercase tracking-wide">
          Trifecta Asset Tracker
        </h1>
        {location && (
          <p className="mt-1 text-sm text-text-muted">{location.name}</p>
        )}
        <nav className="mt-6 flex w-full flex-col gap-3">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-sm border border-border bg-surface p-2 text-left"
            >
              <span className="flex min-h-14 flex-col justify-center border border-border/70 px-4">
                <span className="font-display text-lg font-semibold uppercase tracking-wide">
                  {l.label}
                </span>
                <span className="text-sm text-text-muted">{l.sub}</span>
              </span>
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
