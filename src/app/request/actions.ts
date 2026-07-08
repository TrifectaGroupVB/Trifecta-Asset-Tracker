"use server";

import { prisma } from "@/lib/db";
import { URGENCIES, type Urgency } from "@/lib/constants";
import { saveUpload } from "@/lib/uploads";

export type SubmitServiceRequestResult =
  | { ok: true; requestNumber: number; urgency: Urgency }
  | { ok: false; error: string };

export async function submitServiceRequest(
  formData: FormData
): Promise<SubmitServiceRequestResult> {
  const equipmentId = String(formData.get("equipmentId") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const urgency = String(formData.get("urgency") ?? "");
  const requesterName = String(formData.get("requesterName") ?? "").trim();
  const photo = formData.get("photo");

  if (!equipmentId) return { ok: false, error: "Pick the equipment this is about." };
  if (!description) return { ok: false, error: "Tell us what's wrong." };
  if (!(URGENCIES as readonly string[]).includes(urgency))
    return { ok: false, error: "Pick an urgency level." };
  if (!requesterName) return { ok: false, error: "Enter your name." };

  const equipment = await prisma.equipment.findUnique({
    where: { id: equipmentId },
    select: { id: true },
  });
  if (!equipment)
    return { ok: false, error: "That equipment isn't in the system anymore." };

  let photoUrl: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    const saved = await saveUpload(photo, "requests", "image");
    if (!saved.ok) return { ok: false, error: saved.error };
    photoUrl = saved.url;
  }

  const request = await prisma.$transaction(async (tx) => {
    const max = await tx.serviceRequest.aggregate({
      _max: { requestNumber: true },
    });
    return tx.serviceRequest.create({
      data: {
        requestNumber: (max._max.requestNumber ?? 0) + 1,
        equipmentId,
        requesterName,
        description,
        photoUrl,
        urgency,
        status: "OPEN",
      },
    });
  });

  return {
    ok: true,
    requestNumber: request.requestNumber,
    urgency: urgency as Urgency,
  };
}
