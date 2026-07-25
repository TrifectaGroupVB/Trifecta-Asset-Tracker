import { stat } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { DataPlate } from "@/components/DataPlate";
import { EquipmentTabs } from "@/components/equipment/EquipmentTabs";
import { prisma } from "@/lib/db";
import { formatDate, formatFileSize } from "@/lib/format";
import { hasDashboardSession } from "@/lib/session";

async function fileSizeFor(fileUrl: string): Promise<number | null> {
  try {
    // Blob-hosted files (absolute URLs) report size via Content-Length;
    // local dev files come off the disk.
    if (fileUrl.startsWith("http")) {
      const res = await fetch(fileUrl, { method: "HEAD" });
      const len = res.headers.get("content-length");
      return len ? Number(len) : null;
    }
    const s = await stat(path.join(process.cwd(), "public", fileUrl));
    return s.size;
  } catch {
    return null;
  }
}

export default async function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const eq = await prisma.equipment.findUnique({
    where: { id },
    include: {
      specFields: true,
      manuals: true,
      parts: { orderBy: { name: "asc" } },
      serviceRecords: { orderBy: { date: "desc" } },
    },
  });
  if (!eq) notFound();

  // Only staff who already have a dashboard session (PIN or biometrics —
  // both issue the same session cookie) get the edit shortcut. No session
  // means no badge at all, not a link that bounces to a PIN prompt.
  const canEdit = await hasDashboardSession();
  const techs = canEdit
    ? await prisma.tech.findMany({ orderBy: { name: "asc" } })
    : [];

  const manuals = await Promise.all(
    eq.manuals.map(async (m) => ({
      id: m.id,
      title: m.title,
      fileUrl: m.fileUrl,
      sizeLabel: formatFileSize(await fileSizeFor(m.fileUrl)),
    }))
  );

  // Server component — renders once per request, so "now" is stable here.
  const warrantyActive =
    eq.warrantyExpires != null &&
    // eslint-disable-next-line react-hooks/purity
    eq.warrantyExpires.getTime() > Date.now();

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl">
      <div className="p-4 pb-0">
        {eq.decommissionedAt && (
          <p className="mb-3 rounded-sm border border-text-muted/40 bg-surface px-3 py-2 font-display text-sm uppercase tracking-widest text-text-muted">
            Decommissioned {formatDate(eq.decommissionedAt)} — no longer in service
          </p>
        )}
        <DataPlate
          title={eq.name}
          subtitle={eq.manufacturer}
          photoUrl={eq.photoUrl}
          badge={
            canEdit ? (
              <Link
                href={`/dashboard/admin/equipment/${eq.id}`}
                className="inline-flex min-h-12 items-center px-2 font-display text-sm uppercase tracking-wide text-accent"
              >
                Edit
              </Link>
            ) : undefined
          }
          fields={[
            { label: "Model", value: eq.model },
            { label: "Serial", value: eq.serial },
            { label: "Location", value: eq.location, mono: false },
            { label: "Installed", value: formatDate(eq.installDate) },
            {
              label: "Warranty",
              value:
                eq.warrantyExpires == null ? (
                  <span className="text-text-muted">UNKNOWN</span>
                ) : warrantyActive ? (
                  <span className="text-status-completed">
                    ACTIVE until {formatDate(eq.warrantyExpires)}
                  </span>
                ) : (
                  <span className="text-danger/90">EXPIRED</span>
                ),
              wide: true,
            },
            ...(eq.notes
              ? [
                  {
                    label: "Notes",
                    value: (
                      <span className="whitespace-pre-line">{eq.notes}</span>
                    ),
                    mono: false,
                    wide: true,
                  },
                ]
              : []),
          ]}
        />
      </div>

      <EquipmentTabs
        equipmentId={eq.id}
        equipmentName={eq.name}
        canEdit={canEdit}
        techNames={techs.map((t) => t.name)}
        specFields={eq.specFields.map((s) => ({
          id: s.id,
          label: s.label,
          value: s.value,
        }))}
        manuals={manuals}
        parts={eq.parts.map((p) => ({
          id: p.id,
          name: p.name,
          partNumber: p.partNumber,
          price: p.price,
        }))}
        records={eq.serviceRecords.map((r) => ({
          id: r.id,
          date: formatDate(r.date),
          techName: r.techName,
          workPerformed: r.workPerformed,
          partsUsed: r.partsUsed,
        }))}
      />
      </main>
    </>
  );
}
