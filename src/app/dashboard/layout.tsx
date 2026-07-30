import Link from "next/link";
import { hasDashboardSession } from "@/lib/session";
import { lockDashboard } from "./auth-actions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authed = await hasDashboardSession();
  if (!authed) return <>{children}</>;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <nav className="flex items-center gap-1 border-b border-border px-4 print:hidden">
        <Link
          href="/"
          aria-label="Home"
          className="flex min-h-12 items-center pr-1 text-text-muted"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-5"
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
        </Link>
        <Link
          href="/dashboard"
          className="flex min-h-12 items-center px-2 font-display font-semibold uppercase tracking-wide"
        >
          Queue
        </Link>
        <Link
          href="/dashboard/tags"
          className="flex min-h-12 items-center px-2 font-display font-semibold uppercase tracking-wide text-text-muted"
        >
          Tags
        </Link>
        <Link
          href="/dashboard/admin"
          className="flex min-h-12 items-center px-2 font-display font-semibold uppercase tracking-wide text-text-muted"
        >
          Admin
        </Link>
        <Link
          href="/dashboard/settings"
          className="flex min-h-12 items-center px-2 font-display font-semibold uppercase tracking-wide text-text-muted"
        >
          Settings
        </Link>
        <form action={lockDashboard} className="ml-auto">
          <button
            type="submit"
            className="flex min-h-12 items-center px-2 font-display uppercase tracking-wide text-text-muted"
          >
            Lock
          </button>
        </form>
      </nav>
      {children}
    </div>
  );
}
