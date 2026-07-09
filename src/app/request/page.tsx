import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { ServiceRequestForm } from "@/components/request/ServiceRequestForm";
import { prisma } from "@/lib/db";
import { resolveLocation } from "@/lib/location";

export const metadata: Metadata = {
  title: "Service Request — Trifecta Asset Tracker",
};

export default async function ServiceRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ equipment?: string; from?: string; location?: string }>;
}) {
  const {
    equipment: equipmentParam,
    from,
    location: locationParam,
  } = await searchParams;

  // A direct equipment link (e.g. "Report a problem" from that unit's page)
  // pins the location to wherever that equipment actually lives, overriding
  // both the `?location=` param and the cookie.
  const preselected = equipmentParam
    ? await prisma.equipment.findUnique({
        where: { id: equipmentParam },
        select: { restaurant: { select: { slug: true } } },
      })
    : null;

  const { location, locations } = await resolveLocation(
    preselected?.restaurant.slug ?? locationParam
  );

  const equipment = location
    ? await prisma.equipment.findMany({
        where: { restaurantId: location.id },
        select: { id: true, name: true, location: true },
        orderBy: { name: "asc" },
      })
    : [];

  const initialEquipmentId =
    equipment.find((e) => e.id === equipmentParam)?.id ?? null;

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl p-4 pb-16">
        <h1 className="mt-2 font-display text-3xl font-semibold uppercase tracking-wide">
          Service Request
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Report a problem — the maintenance team sees it right away.
        </p>
        {location && locations.length > 1 && (
          <p className="mt-1 text-sm text-text-muted">
            {location.name}
            {!preselected && (
              <>
                {" — "}
                <Link href="/" className="text-accent underline underline-offset-4">
                  Switch location
                </Link>
              </>
            )}
          </p>
        )}
        {from && (
          <p className="mt-2 inline-flex min-h-8 items-center rounded-sm border border-border bg-surface px-3 font-display text-xs uppercase tracking-widest text-text-muted">
            Station: {from}
          </p>
        )}
        <ServiceRequestForm
          equipment={equipment}
          initialEquipmentId={initialEquipmentId}
        />
      </main>
    </>
  );
}
