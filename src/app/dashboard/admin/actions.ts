"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getDashboardPin, hasDashboardSession, setSessionCookie } from "@/lib/session";
import { saveUpload } from "@/lib/uploads";

async function assertSession() {
  if (!(await hasDashboardSession())) redirect("/dashboard");
}

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function dateOrNull(value: string): Date | null {
  return value ? new Date(value) : null;
}

// Accepts a plain URL and prepends https:// if the scheme was left off
// (e.g. someone pastes "acmeparts.com/widget" instead of the full URL).
// Returns null for empty input or something that still isn't a valid URL.
function normalizeUrl(value: string): string | null {
  if (!value) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(withScheme).toString();
  } catch {
    return null;
  }
}

function refreshEquipment(id: string) {
  revalidatePath("/dashboard/admin");
  revalidatePath(`/dashboard/admin/equipment/${id}`);
  revalidatePath(`/equipment/${id}`);
  revalidatePath("/equipment");
}

// ---- Equipment ----

export async function saveEquipmentDetails(formData: FormData) {
  await assertSession();
  const id = str(formData, "id");
  const data = {
    name: str(formData, "name"),
    manufacturer: str(formData, "manufacturer"),
    model: str(formData, "model"),
    serial: str(formData, "serial"),
    location: str(formData, "location"),
    installDate: dateOrNull(str(formData, "installDate")),
    warrantyExpires: dateOrNull(str(formData, "warrantyExpires")),
    notes: str(formData, "notes") || null,
  };
  if (!data.name || !data.manufacturer || !data.model || !data.serial || !data.location)
    return;

  if (id) {
    await prisma.equipment.update({ where: { id }, data });
    refreshEquipment(id);
  } else {
    const created = await prisma.equipment.create({ data });
    revalidatePath("/dashboard/admin");
    redirect(`/dashboard/admin/equipment/${created.id}`);
  }
}

export async function uploadEquipmentPhoto(formData: FormData) {
  await assertSession();
  const id = str(formData, "id");
  const file = formData.get("photo");
  if (!id || !(file instanceof File)) return;
  const saved = await saveUpload(file, "equipment", "image");
  if (!saved.ok) return;
  await prisma.equipment.update({ where: { id }, data: { photoUrl: saved.url } });
  refreshEquipment(id);
}

export async function deleteEquipment(formData: FormData) {
  await assertSession();
  const id = str(formData, "id");
  try {
    await prisma.equipment.delete({ where: { id } });
  } catch {
    // FK restrict: has service requests/records — keep history, block delete
    redirect(`/dashboard/admin/equipment/${id}?error=has-history`);
  }
  revalidatePath("/dashboard/admin");
  revalidatePath("/equipment");
  redirect("/dashboard/admin");
}

// ---- Spec fields ----

export async function saveSpecRow(formData: FormData) {
  await assertSession();
  const equipmentId = str(formData, "equipmentId");
  const specId = str(formData, "specId");
  const intent = str(formData, "intent");
  if (intent === "delete" && specId) {
    await prisma.specField.delete({ where: { id: specId } });
  } else {
    const label = str(formData, "label");
    const value = str(formData, "value");
    if (!label || !value) return;
    if (specId) {
      await prisma.specField.update({ where: { id: specId }, data: { label, value } });
    } else {
      await prisma.specField.create({ data: { equipmentId, label, value } });
    }
  }
  refreshEquipment(equipmentId);
}

// ---- Manuals ----

export async function addManual(formData: FormData) {
  await assertSession();
  const equipmentId = str(formData, "equipmentId");
  const title = str(formData, "title");
  const url = normalizeUrl(str(formData, "url"));
  const file = formData.get("file");
  if (!equipmentId || !title) return;

  let fileUrl: string;
  if (url) {
    fileUrl = url;
  } else if (file instanceof File && file.size > 0) {
    const saved = await saveUpload(file, "manuals", "pdf");
    if (!saved.ok) return;
    fileUrl = saved.url;
  } else {
    return; // neither a link nor a file was given
  }

  await prisma.manualFile.create({
    data: { equipmentId, title, fileUrl },
  });
  refreshEquipment(equipmentId);
}

export async function deleteManual(formData: FormData) {
  await assertSession();
  const manualId = str(formData, "manualId");
  const manual = await prisma.manualFile.delete({ where: { id: manualId } });
  refreshEquipment(manual.equipmentId);
}

// ---- Parts ----

export async function savePartRow(formData: FormData) {
  await assertSession();
  const equipmentId = str(formData, "equipmentId");
  const partId = str(formData, "partId");
  const intent = str(formData, "intent");

  if (intent === "delete" && partId) {
    // Keep part-order history intact: block delete if the part was ever ordered
    const usage = await prisma.partOrderLine.count({ where: { partId } });
    if (usage === 0) await prisma.part.delete({ where: { id: partId } });
    refreshEquipment(equipmentId);
    return;
  }

  const name = str(formData, "name");
  const partNumber = str(formData, "partNumber");
  const priceRaw = str(formData, "price");
  const price = priceRaw ? Number.parseFloat(priceRaw) : null;
  const vendorUrl = normalizeUrl(str(formData, "vendorUrl"));
  if (!name || !partNumber || (price != null && !Number.isFinite(price))) return;

  let photoUrl: string | undefined;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const saved = await saveUpload(photo, "parts", "image");
    if (saved.ok) photoUrl = saved.url;
  }

  if (partId) {
    await prisma.part.update({
      where: { id: partId },
      data: { name, partNumber, price, vendorUrl, ...(photoUrl ? { photoUrl } : {}) },
    });
  } else {
    await prisma.part.create({
      data: { equipmentId, name, partNumber, price, vendorUrl, photoUrl: photoUrl ?? null },
    });
  }
  refreshEquipment(equipmentId);
}

// ---- Techs ----

export async function saveTechRow(formData: FormData) {
  await assertSession();
  const techId = str(formData, "techId");
  const intent = str(formData, "intent");
  if (intent === "delete" && techId) {
    // The tech FK is onDelete: SetNull — that clears techId on any assigned
    // requests but leaves `status` at ASSIGNED/IN_PROGRESS, which would show
    // as "ASSIGNED" with no tech in the queue. Revert those back to OPEN so
    // the queue stays honest that nobody is currently on it.
    const tech = await prisma.tech.findUnique({ where: { id: techId } });
    const orphaned = await prisma.serviceRequest.findMany({
      where: { techId, status: { in: ["ASSIGNED", "IN_PROGRESS"] } },
      select: { id: true },
    });
    await prisma.$transaction([
      ...orphaned.flatMap((r) => [
        prisma.serviceRequest.update({
          where: { id: r.id },
          data: { status: "OPEN" },
        }),
        prisma.requestEvent.create({
          data: {
            serviceRequestId: r.id,
            kind: "STATUS",
            text: `Reopened — ${tech?.name ?? "assigned tech"} was removed`,
          },
        }),
      ]),
      prisma.tech.delete({ where: { id: techId } }),
    ]);
    revalidatePath("/dashboard/admin");
    revalidatePath("/dashboard");
    orphaned.forEach((r) => revalidatePath(`/dashboard/requests/${r.id}`));
    return;
  }
  const name = str(formData, "name");
  const email = str(formData, "email");
  const phone = str(formData, "phone");
  if (!name || !email || !phone) return;
  if (techId) {
    await prisma.tech.update({ where: { id: techId }, data: { name, email, phone } });
  } else {
    await prisma.tech.create({ data: { name, email, phone } });
  }
  revalidatePath("/dashboard/admin");
}

// ---- Settings ----

export async function updateAdminEmail(formData: FormData) {
  await assertSession();
  const email = str(formData, "adminEmail");
  if (!email || !email.includes("@")) return;
  await prisma.setting.upsert({
    where: { key: "adminEmail" },
    update: { value: email },
    create: { key: "adminEmail", value: email },
  });
  revalidatePath("/dashboard/admin");
}

export async function changePin(formData: FormData) {
  await assertSession();
  const currentPin = str(formData, "currentPin");
  const newPin = str(formData, "newPin");
  const real = await getDashboardPin();
  if (!real || currentPin !== real) {
    redirect("/dashboard/admin?error=wrong-pin");
  }
  if (!/^\d{6}$/.test(newPin)) {
    redirect("/dashboard/admin?error=bad-pin");
  }
  await prisma.setting.upsert({
    where: { key: "dashboardPin" },
    update: { value: newPin },
    create: { key: "dashboardPin", value: newPin },
  });
  // Sessions are signed with the PIN — re-issue so this device stays unlocked
  await setSessionCookie(newPin);
  redirect("/dashboard/admin?ok=pin-changed");
}
