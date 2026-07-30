"use server";

import { prisma } from "@/lib/db";
import { hasDashboardSession } from "@/lib/session";
import { saveUpload } from "@/lib/uploads";

export type AssignTagResult =
  | {
      ok: true;
      summary:
        | { kind: "EQUIPMENT"; equipmentId: string; name: string; location: string }
        | { kind: "STATION"; label: string | null };
    }
  | { ok: false; error: string };

// The wizard sends nameplate specs as a JSON blob in a hidden field rather
// than as N form fields, since the count isn't known until the plate is read.
// Anything malformed is dropped rather than failing the whole create — the
// unit itself matters more than its spec rows.
function parseSpecs(raw: FormDataEntryValue | null): { label: string; value: string }[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((entry) => {
      const row = entry as Record<string, unknown>;
      const label = typeof row?.label === "string" ? row.label.trim() : "";
      const value = typeof row?.value === "string" ? row.value.trim() : "";
      return { label, value };
    })
    .filter((s) => s.label && s.value)
    .slice(0, 30);
}

async function claimableTag(code: string) {
  const tag = await prisma.tag.findUnique({
    where: { code },
    include: { batch: true },
  });
  if (!tag || tag.voided) return null;
  if (tag.role !== "UNASSIGNED") return null;
  return tag;
}

// NOTE: no revalidatePath here — every page that shows tag state is
// cookie-gated and therefore dynamic (always fresh). Revalidating /t/[code]
// mid-action makes the router re-run the route, which redirects away
// before the wizard can show its confirmation screen.

export async function assignTagToEquipment(
  formData: FormData
): Promise<AssignTagResult> {
  if (!(await hasDashboardSession()))
    return { ok: false, error: "Session expired — reload and enter the PIN again." };
  const code = String(formData.get("code") ?? "");
  const equipmentId = String(formData.get("equipmentId") ?? "");

  const [tag, equipment] = await Promise.all([
    claimableTag(code),
    prisma.equipment.findUnique({ where: { id: equipmentId } }),
  ]);
  if (!tag) return { ok: false, error: "This tag was already set up or voided." };
  if (!equipment) return { ok: false, error: "That equipment no longer exists." };
  if (equipment.restaurantId !== tag.batch.restaurantId)
    return { ok: false, error: "That equipment belongs to a different location." };

  await prisma.tag.update({
    where: { id: tag.id },
    data: { role: "EQUIPMENT", equipmentId, assignedAt: new Date() },
  });
  return {
    ok: true,
    summary: {
      kind: "EQUIPMENT",
      equipmentId,
      name: equipment.name,
      location: equipment.location,
    },
  };
}

export async function createEquipmentAndAssignTag(
  formData: FormData
): Promise<AssignTagResult> {
  if (!(await hasDashboardSession()))
    return { ok: false, error: "Session expired — reload and enter the PIN again." };
  const code = String(formData.get("code") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const manufacturer = String(formData.get("manufacturer") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  const serial = String(formData.get("serial") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const photo = formData.get("photo");
  const specs = parseSpecs(formData.get("specs"));

  if (!name || !manufacturer || !model || !serial || !location)
    return { ok: false, error: "Fill in every field — photo is the only optional one." };

  const tag = await claimableTag(code);
  if (!tag) return { ok: false, error: "This tag was already set up or voided." };

  let photoUrl: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    const saved = await saveUpload(photo, "equipment", "image");
    if (!saved.ok) return { ok: false, error: saved.error };
    photoUrl = saved.url;
  }

  const equipment = await prisma.equipment.create({
    data: {
      restaurantId: tag.batch.restaurantId,
      name,
      manufacturer,
      model,
      serial,
      location,
      photoUrl,
      // Specs only ever arrive here from a nameplate scan (the hand-typed
      // form has no spec inputs) — a plate carries voltage/refrigerant/BTU
      // etc. that would otherwise be lost, and re-reading a mounted plate
      // later usually means crawling behind the unit.
      ...(specs.length > 0 ? { specFields: { create: specs } } : {}),
    },
  });
  await prisma.tag.update({
    where: { id: tag.id },
    data: { role: "EQUIPMENT", equipmentId: equipment.id, assignedAt: new Date() },
  });
  return {
    ok: true,
    summary: { kind: "EQUIPMENT", equipmentId: equipment.id, name, location },
  };
}

export async function assignTagAsStation(
  formData: FormData
): Promise<AssignTagResult> {
  if (!(await hasDashboardSession()))
    return { ok: false, error: "Session expired — reload and enter the PIN again." };
  const code = String(formData.get("code") ?? "");
  const label = String(formData.get("label") ?? "").trim() || null;

  const tag = await claimableTag(code);
  if (!tag) return { ok: false, error: "This tag was already set up or voided." };

  await prisma.tag.update({
    where: { id: tag.id },
    data: { role: "SERVICE_REQUEST", label, assignedAt: new Date() },
  });
  return { ok: true, summary: { kind: "STATION", label } };
}
