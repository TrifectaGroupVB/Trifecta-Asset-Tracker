import Link from "next/link";

function HomeIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M5.5 10v9.5a1 1 0 0 0 1 1H9.5v-6h5v6h3a1 1 0 0 0 1-1V10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Slim persistent home link. Appears on every screen except the home page
 * itself, print sheets (their own print:hidden chrome), and the public
 * redirect-only /t/[code] paths.
 */
export function AppHeader() {
  return (
    <div className="border-b border-border print:hidden">
      <Link
        href="/"
        className="mx-auto flex min-h-12 max-w-2xl items-center gap-2 px-4 text-text-muted"
      >
        <HomeIcon />
        <span className="font-display text-sm font-semibold uppercase tracking-widest">
          Trifecta Asset Tracker
        </span>
      </Link>
    </div>
  );
}
