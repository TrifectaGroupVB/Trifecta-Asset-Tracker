import type { Metadata } from "next";
import { ServiceRequestForm } from "@/components/request/ServiceRequestForm";
import { prisma } from "@/lib/db";

export const metadata: Metadata = {
  title: "Service Request — Trifecta Asset Tracker",
};

export default async function ServiceRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ equipment?: string; from?: string }>;
}) {
  const { equipment: equipmentParam, from } = await searchParams;

  const equipment = await prisma.equipment.findMany({
    select: { id: true, name: true, location: true },
    orderBy: { name: "asc" },
  });

  const initialEquipmentId =
    equipment.find((e) => e.id === equipmentParam)?.id ?? null;

  return (
    <main className="mx-auto w-full max-w-2xl p-4 pb-16">
      <h1 className="mt-2 font-display text-3xl font-semibold uppercase tracking-wide">
        Service Request
      </h1>
      <p className="mt-1 text-sm text-text-muted">
        Report a problem — the maintenance team sees it right away.
      </p>
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
  );
}
