import Image from "next/image";
import Link from "next/link";
import { LocationMenu } from "@/components/LocationMenu";
import { resolveLocation } from "@/lib/location";

const LINKS = [
  { href: "/equipment", label: "Equipment", sub: "Browse every unit" },
  { href: "/request", label: "Report a problem", sub: "File a service request" },
  { href: "/dashboard", label: "Dashboard", sub: "Staff only — PIN required" },
];

export default async function Home() {
  const { location, locations } = await resolveLocation();

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-8 p-6">
      {locations.length > 1 && (
        <LocationMenu
          locations={locations}
          currentLocationId={location?.id ?? null}
        />
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
