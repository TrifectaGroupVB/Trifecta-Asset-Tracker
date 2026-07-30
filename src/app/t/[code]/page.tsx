import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { PinGate } from "@/components/dashboard/PinGate";
import { TagWizard } from "@/components/tags/TagWizard";
import { prisma } from "@/lib/db";
import {
  isNameplateScannerEnabled,
  SCANNER_DISABLED_COPY,
} from "@/lib/nameplate";
import { hasDashboardSession } from "@/lib/session";
import { isFeatureEnabled } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Tag — Trifecta Asset Tracker",
};

function InactiveTag() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-sm flex-col items-center justify-center p-6 text-center">
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
    </>
  );
}

// The only URL a QR sticker ever encodes.
export default async function TagPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const tag = await prisma.tag.findUnique({
    where: { code: code.toUpperCase() },
    include: { batch: { include: { restaurant: true } } },
  });

  if (!tag || tag.voided) return <InactiveTag />;

  if (tag.role === "EQUIPMENT") {
    if (!tag.equipmentId) return <InactiveTag />; // equipment was deleted
    redirect(`/equipment/${tag.equipmentId}`);
  }

  if (tag.role === "SERVICE_REQUEST") {
    // Carry the tag's own location through so the request form shows that
    // location's equipment, regardless of what's currently toggled at home.
    const params = new URLSearchParams({ location: tag.batch.restaurant.slug });
    if (tag.label) params.set("from", tag.label);
    redirect(`/request?${params.toString()}`);
  }

  // UNASSIGNED → setup wizard, PIN-gated so a guest scan can't claim a sticker
  if (!(await hasDashboardSession())) {
    return (
      <PinGate title="New tag" subtitle="Enter the admin PIN to set it up." />
    );
  }

  // Scoped to this tag's own restaurant — a blank Chix tag can only be
  // pointed at Chix equipment (or create new equipment, which inherits the
  // same restaurant automatically).
  const [equipment, featureOn] = await Promise.all([
    prisma.equipment.findMany({
      where: { restaurantId: tag.batch.restaurantId },
      select: { id: true, name: true, location: true },
      orderBy: { name: "asc" },
    }),
    isFeatureEnabled("nameplateScan"),
  ]);

  // Switched off in Settings → the control isn't there at all. On but with no
  // API key → say so, rather than offering a scan button that can only fail
  // while someone is standing in front of a machine.
  const nameplateScan = !featureOn
    ? "off"
    : isNameplateScannerEnabled()
      ? "ready"
      : "no-key";

  return (
    <TagWizard
      code={tag.code}
      equipment={equipment}
      restaurantName={tag.batch.restaurant.name}
      nameplateScan={nameplateScan}
      scannerDisabledCopy={SCANNER_DISABLED_COPY}
    />
  );
}
