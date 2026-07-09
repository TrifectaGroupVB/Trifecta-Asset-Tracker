"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { formatOrderNumber } from "@/lib/format";
import { hasDashboardSession } from "@/lib/session";

export type SubmitPartOrderResult =
  | { ok: true; orderNumber: number }
  | { ok: false; error: string };

export async function submitPartOrder(input: {
  equipmentId: string;
  requesterName: string;
  lines: { partId: string; qty: number }[];
}): Promise<SubmitPartOrderResult> {
  const requesterName = input.requesterName.trim();
  const lines = input.lines.filter(
    (l) => Number.isInteger(l.qty) && l.qty > 0 && l.qty <= 99
  );

  if (!requesterName) return { ok: false, error: "Please enter your name." };
  if (lines.length === 0)
    return { ok: false, error: "No parts selected." };

  const equipment = await prisma.equipment.findUnique({
    where: { id: input.equipmentId },
    include: { parts: true, restaurant: true },
  });
  if (!equipment) return { ok: false, error: "Equipment not found." };

  const partsById = new Map(equipment.parts.map((p) => [p.id, p]));
  if (lines.some((l) => !partsById.has(l.partId)))
    return { ok: false, error: "Order contains an unknown part." };

  const order = await prisma.$transaction(async (tx) => {
    const max = await tx.partOrder.aggregate({ _max: { orderNumber: true } });
    return tx.partOrder.create({
      data: {
        orderNumber: (max._max.orderNumber ?? 0) + 1,
        equipmentId: equipment.id,
        requesterName,
        lines: { create: lines.map((l) => ({ partId: l.partId, qty: l.qty })) },
      },
    });
  });

  const adminEmail = (
    await prisma.setting.findUnique({ where: { key: "adminEmail" } })
  )?.value;
  const restaurantName = equipment.restaurant.name;

  const orderLabel = formatOrderNumber(order.orderNumber);
  const lineText = lines
    .map((l) => {
      const p = partsById.get(l.partId)!;
      return `${p.name.toUpperCase()} — ${p.partNumber} x${l.qty}`;
    })
    .join("\n");

  const text = [
    `Part order ${orderLabel}`,
    restaurantName,
    ``,
    `Equipment: ${equipment.name} (${equipment.manufacturer} ${equipment.model})`,
    `Requested by: ${requesterName}`,
    ``,
    lineText,
  ].join("\n");

  if (adminEmail) {
    await sendEmail({
      to: adminEmail,
      subject: `Part order ${orderLabel} — ${equipment.name}`,
      text,
    });
  } else {
    console.warn("[part-order] no adminEmail setting; email skipped");
  }

  return { ok: true, orderNumber: order.orderNumber };
}

export type AddServiceRecordResult =
  | { ok: true }
  | { ok: false; error: string };

export async function addServiceRecord(input: {
  equipmentId: string;
  date: string;
  techName: string;
  workPerformed: string;
  partsUsed: string;
}): Promise<AddServiceRecordResult> {
  if (!(await hasDashboardSession()))
    return { ok: false, error: "Not authorized." };

  const techName = input.techName.trim();
  const workPerformed = input.workPerformed.trim();
  const partsUsed = input.partsUsed.trim();
  const date = new Date(input.date);

  if (Number.isNaN(date.getTime()))
    return { ok: false, error: "Please enter a valid date." };
  if (!techName) return { ok: false, error: "Please enter who did the work." };
  if (!workPerformed)
    return { ok: false, error: "Please describe the work performed." };

  const equipment = await prisma.equipment.findUnique({
    where: { id: input.equipmentId },
  });
  if (!equipment) return { ok: false, error: "Equipment not found." };

  await prisma.serviceRecord.create({
    data: {
      equipmentId: equipment.id,
      date,
      techName,
      workPerformed,
      partsUsed: partsUsed || null,
    },
  });

  revalidatePath(`/equipment/${equipment.id}`);
  return { ok: true };
}
