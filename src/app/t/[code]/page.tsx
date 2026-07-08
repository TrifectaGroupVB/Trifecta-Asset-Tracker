import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PinGate } from "@/components/dashboard/PinGate";
import { TagWizard } from "@/components/tags/TagWizard";
import { prisma } from "@/lib/db";
import { hasDashboardSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Tag — Trifecta Asset Tracker",
};

function InactiveTag() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center p-6 text-center">
      <h1 className="font-display text-2xl font-semibold uppercase tracking-wide">
        This tag isn&rsquo;t active
      </h1>
      <p className="mt-2 text-text-muted">
        It may have been retired or replaced. If it&rsquo;s stuck on a machine that
        needs service, you can still file a request.
      </p>
      <Link
        href="/request"
        className="mt-6 inline-flex h-12 items-center rounded-sm bg-accent px-5 font-display font-semibold uppercase tracking-wide text-bg"
      >
        Report a problem
      </Link>
    </main>
  );
}

// The only URL a QR sticker ever encodes.
export default async function TagPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const tag = await prisma.tag.findUnique({ where: { code: code.toUpperCase() } });

  if (!tag || tag.voided) return <InactiveTag />;

  if (tag.role === "EQUIPMENT") {
    if (!tag.equipmentId) return <InactiveTag />; // equipment was deleted
    redirect(`/equipment/${tag.equipmentId}`);
  }

  if (tag.role === "SERVICE_REQUEST") {
    redirect(
      tag.label ? `/request?from=${encodeURIComponent(tag.label)}` : "/request"
    );
  }

  // UNASSIGNED → setup wizard, PIN-gated so a guest scan can't claim a sticker
  if (!(await hasDashboardSession())) {
    return (
      <PinGate title="New tag" subtitle="Enter the admin PIN to set it up." />
    );
  }

  const equipment = await prisma.equipment.findMany({
    select: { id: true, name: true, location: true },
    orderBy: { name: "asc" },
  });

  return <TagWizard code={tag.code} equipment={equipment} />;
}
