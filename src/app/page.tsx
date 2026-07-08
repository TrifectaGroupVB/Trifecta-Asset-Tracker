import Image from "next/image";
import Link from "next/link";

const LINKS = [
  { href: "/equipment", label: "Equipment", sub: "Browse every unit" },
  { href: "/request", label: "Report a problem", sub: "File a service request" },
  { href: "/dashboard", label: "Dashboard", sub: "Staff only — PIN required" },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-8 p-6">
      <Image
        src="/brand/watermans-logo-full.png"
        alt="Waterman's Surfside Grille — Fresh, Local Seafood, since 1981"
        width={1136}
        height={692}
        priority
        className="w-full max-w-xs"
      />
      <div className="w-full text-center">
        <h1 className="font-display text-3xl font-semibold uppercase tracking-wide">
          Trifecta Asset Tracker
        </h1>
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
