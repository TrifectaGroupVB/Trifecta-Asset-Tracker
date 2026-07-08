"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { formatRequestNumber } from "@/lib/format";
import { hasDashboardSession } from "@/lib/session";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

async function assertSession() {
  if (!(await hasDashboardSession())) redirect("/dashboard");
}

function refresh(requestId: string, equipmentId?: string) {
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/requests/${requestId}`);
  if (equipmentId) revalidatePath(`/equipment/${equipmentId}`);
}

export async function assignTech(formData: FormData) {
  await assertSession();
  const requestId = String(formData.get("requestId") ?? "");
  const techId = String(formData.get("techId") ?? "");

  const [request, tech] = await Promise.all([
    prisma.serviceRequest.findUnique({
      where: { id: requestId },
      include: { equipment: true },
    }),
    prisma.tech.findUnique({ where: { id: techId } }),
  ]);
  if (!request || !tech || request.status === "COMPLETED") return;

  await prisma.$transaction([
    prisma.serviceRequest.update({
      where: { id: requestId },
      data: { techId, status: "ASSIGNED" },
    }),
    prisma.requestEvent.create({
      data: {
        serviceRequestId: requestId,
        kind: "STATUS",
        text: `Assigned to ${tech.name}`,
      },
    }),
  ]);

  const label = formatRequestNumber(request.requestNumber);
  const urgentTag = request.urgency === "URGENT" ? "[URGENT] " : "";
  const lines = [
    `You've been assigned ${label}.`,
    ``,
    `Equipment: ${request.equipment.name} — ${request.equipment.location}`,
    `Requested by: ${request.requesterName}`,
    `Urgency: ${request.urgency}`,
    ``,
    request.description,
  ];
  if (request.photoUrl) {
    const photoLink = request.photoUrl.startsWith("http")
      ? request.photoUrl // Blob URLs are already absolute
      : `${BASE_URL}${request.photoUrl}`;
    lines.push(``, `Photo: ${photoLink}`);
  }
  lines.push(``, `Request: ${BASE_URL}/dashboard/requests/${request.id}`);

  await sendEmail({
    to: tech.email,
    subject: `${urgentTag}${label} — ${request.equipment.name}`,
    text: lines.join("\n"),
  });

  refresh(requestId);
}

export async function startWork(formData: FormData) {
  await assertSession();
  const requestId = String(formData.get("requestId") ?? "");
  const request = await prisma.serviceRequest.findUnique({
    where: { id: requestId },
  });
  if (!request || request.status !== "ASSIGNED") return;

  await prisma.$transaction([
    prisma.serviceRequest.update({
      where: { id: requestId },
      data: { status: "IN_PROGRESS" },
    }),
    prisma.requestEvent.create({
      data: { serviceRequestId: requestId, kind: "STATUS", text: "Work started" },
    }),
  ]);
  refresh(requestId);
}

export async function completeRequest(formData: FormData) {
  await assertSession();
  const requestId = String(formData.get("requestId") ?? "");
  const workPerformed = String(formData.get("workPerformed") ?? "").trim();
  const partsUsed = String(formData.get("partsUsed") ?? "").trim();
  if (!workPerformed) return;

  const request = await prisma.serviceRequest.findUnique({
    where: { id: requestId },
    include: { tech: true },
  });
  if (!request || request.status !== "IN_PROGRESS") return;

  const completedAt = new Date();
  await prisma.$transaction([
    prisma.serviceRequest.update({
      where: { id: requestId },
      data: { status: "COMPLETED", completedAt },
    }),
    prisma.serviceRecord.create({
      data: {
        equipmentId: request.equipmentId,
        serviceRequestId: request.id,
        date: completedAt,
        techName: request.tech?.name ?? "Unassigned",
        workPerformed,
        partsUsed: partsUsed || null,
      },
    }),
    prisma.requestEvent.create({
      data: { serviceRequestId: requestId, kind: "STATUS", text: "Completed" },
    }),
  ]);
  refresh(requestId, request.equipmentId);
}

export async function addNote(formData: FormData) {
  await assertSession();
  const requestId = String(formData.get("requestId") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;
  const request = await prisma.serviceRequest.findUnique({
    where: { id: requestId },
    select: { id: true },
  });
  if (!request) return;
  await prisma.requestEvent.create({
    data: { serviceRequestId: requestId, kind: "NOTE", text },
  });
  refresh(requestId);
}
