"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasDashboardSession } from "@/lib/session";
import { generateTagCode } from "@/lib/tags";

async function assertSession() {
  if (!(await hasDashboardSession())) redirect("/dashboard");
}

export async function generateTagBatch(formData: FormData) {
  await assertSession();
  const count = Math.min(100, Math.max(1, Number(formData.get("count") ?? 20) || 20));
  const restaurantId =
    String(formData.get("restaurantId") ?? "") ||
    (await prisma.location.findFirst())?.id;
  if (!restaurantId) return;

  const existing = await prisma.tag.findMany({ select: { code: true } });
  const taken = new Set(existing.map((t) => t.code));

  const max = await prisma.tagBatch.aggregate({ _max: { batchNumber: true } });
  const batch = await prisma.tagBatch.create({
    data: {
      batchNumber: (max._max.batchNumber ?? 0) + 1,
      count,
      restaurantId,
      tags: {
        create: Array.from({ length: count }, () => ({
          code: generateTagCode(taken),
        })),
      },
    },
  });

  revalidatePath("/dashboard/tags");
  redirect(`/dashboard/tags/print/${batch.batchNumber}`);
}

export async function voidTag(formData: FormData) {
  await assertSession();
  const tagId = String(formData.get("tagId") ?? "");
  const voided = String(formData.get("voided") ?? "") === "true";
  await prisma.tag.update({ where: { id: tagId }, data: { voided } });
  revalidatePath("/dashboard/tags");
}

// Reassign = wipe back to a blank, then rerun the wizard by scanning/opening /t/{code}
export async function resetTagForReassign(formData: FormData) {
  await assertSession();
  const tagId = String(formData.get("tagId") ?? "");
  const tag = await prisma.tag.update({
    where: { id: tagId },
    data: { role: "UNASSIGNED", equipmentId: null, label: null, assignedAt: null },
  });
  revalidatePath("/dashboard/tags");
  redirect(`/t/${tag.code}`);
}
