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
