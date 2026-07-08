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
