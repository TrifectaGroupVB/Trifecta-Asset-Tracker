"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  extractPartsFromPdf,
  fetchManualPdf,
  type PartCandidate,
} from "@/lib/partsExtract";
import { hasDashboardSession } from "@/lib/session";
import { isFeatureEnabled } from "@/lib/settings";
import { saveUploadBuffer } from "@/lib/uploads";

export type ReadPartsResult =
  | {
      ok: true;
      parts: PartCandidate[];
      /** Part numbers this unit already has — shown as "already added". */
      existingPartNumbers: string[];
      manualUrl: string;
      manualTitle: string;
      pagesRead: { from: number; to: number };
      pageCount: number;
    }
  | { ok: false; error: string };

export type ImportPartsResult =
  | { ok: true; added: number; skipped: number; manualAttached: boolean }
  | { ok: false; error: string };

async function guard(): Promise<string | null> {
  if (!(await hasDashboardSession()))
    return "Session expired — reload and enter the PIN again.";
  if (!(await isFeatureEnabled("partsImport")))
    return "Reading parts from manuals is switched off in Settings.";
  return null;
}

function normalizeUrl(value: string): string | null {
  if (!value) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(withScheme).toString();
  } catch {
    return null;
  }
}

function titleFromSource(url: string, fallback: string): string {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
    const stem = last.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ").trim();
    if (stem) return stem.slice(0, 120);
  } catch {
    /* fall through */
  }
  return fallback;
}

// Step 1 of the importer: get the PDF (by link or upload), store it so the
// import step doesn't have to re-transfer it, and read out the parts list.
// Returns candidates only — nothing is written to the unit yet.
export async function readPartsFromManual(
  formData: FormData
): Promise<ReadPartsResult> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };

  const equipmentId = String(formData.get("equipmentId") ?? "").trim();
  if (!equipmentId) return { ok: false, error: "Missing equipment." };

  const rawUrl = String(formData.get("url") ?? "").trim();
  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;

  let buffer: Buffer;
  let manualUrl: string;
  let defaultTitle: string;

  if (hasFile) {
    buffer = Buffer.from(await file.arrayBuffer());
    const saved = await saveUploadBuffer(buffer, file.type, "manuals", "pdf");
    if (!saved.ok) return { ok: false, error: saved.error };
    manualUrl = saved.url;
    defaultTitle = file.name.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ").trim();
  } else if (rawUrl) {
    const url = normalizeUrl(rawUrl);
    if (!url) return { ok: false, error: "That doesn't look like a valid link." };
    const fetched = await fetchManualPdf(url);
    if (!fetched.ok) return { ok: false, error: fetched.error };
    buffer = fetched.buffer;
    // Linked manuals stay linked — we point at the manufacturer's own copy
    // rather than re-hosting it, same as the existing "add manual by URL".
    manualUrl = url;
    defaultTitle = titleFromSource(url, "Parts manual");
  } else {
    return { ok: false, error: "Paste a link to the manual, or upload the PDF." };
  }

  const [result, existing] = await Promise.all([
    extractPartsFromPdf(buffer),
    prisma.part.findMany({
      where: { equipmentId },
      select: { partNumber: true },
    }),
  ]);
  if (!result.ok) return result;
  if (result.parts.length === 0)
    return {
      ok: false,
      error:
        result.pagesRead.from > 1
          ? `No parts list found on pages ${result.pagesRead.from}–${result.pagesRead.to} of ${result.pageCount}. If the parts list is earlier in the manual, upload just those pages.`
          : "No parts list found in that manual — it may be an operator's guide rather than a service/parts manual.",
    };

  return {
    ok: true,
    parts: result.parts,
    existingPartNumbers: existing.map((p) => p.partNumber),
    manualUrl,
    manualTitle: defaultTitle || "Parts manual",
    pagesRead: result.pagesRead,
    pageCount: result.pageCount,
  };
}

// Step 2: write the ticked parts, and attach the manual to the unit in the
// same pass so the source of the parts is one tap away on the MANUALS tab.
export async function importPartsFromManual(
  formData: FormData
): Promise<ImportPartsResult> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };

  const equipmentId = String(formData.get("equipmentId") ?? "").trim();
  const manualUrl = String(formData.get("manualUrl") ?? "").trim();
  const manualTitle = String(formData.get("manualTitle") ?? "").trim();
  const attachManual = formData.get("attachManual") === "on";

  const equipment = await prisma.equipment.findUnique({
    where: { id: equipmentId },
    select: { id: true },
  });
  if (!equipment) return { ok: false, error: "That equipment no longer exists." };

  let chosen: PartCandidate[];
  try {
    const parsed = JSON.parse(String(formData.get("parts") ?? "[]"));
    if (!Array.isArray(parsed)) throw new Error("not an array");
    chosen = parsed
      .map((entry) => {
        const row = entry as Record<string, unknown>;
        return {
          name: typeof row?.name === "string" ? row.name.trim() : "",
          partNumber:
            typeof row?.partNumber === "string" ? row.partNumber.trim() : "",
          refNumber:
            typeof row?.refNumber === "string" && row.refNumber.trim()
              ? row.refNumber.trim()
              : null,
          qty:
            typeof row?.qty === "string" && row.qty.trim() ? row.qty.trim() : null,
        };
      })
      .filter((p) => p.name && p.partNumber);
  } catch {
    return { ok: false, error: "Something went wrong reading the selection." };
  }
  if (chosen.length === 0) return { ok: false, error: "Tick at least one part to add." };

  // Don't create a second row for a part this unit already has — the importer
  // gets run again when a manual is updated, and re-running it shouldn't
  // duplicate everything that was imported the first time.
  const existing = await prisma.part.findMany({
    where: { equipmentId },
    select: { partNumber: true },
  });
  const taken = new Set(existing.map((p) => p.partNumber.toUpperCase()));
  const toCreate = chosen.filter((p) => !taken.has(p.partNumber.toUpperCase()));

  const alreadyLinked =
    attachManual && manualUrl
      ? (await prisma.manualFile.count({ where: { equipmentId, fileUrl: manualUrl } })) > 0
      : true;
  const shouldAttach = attachManual && Boolean(manualUrl) && !alreadyLinked;

  await prisma.$transaction([
    ...(shouldAttach
      ? [
          prisma.manualFile.create({
            data: {
              equipmentId,
              title: manualTitle || "Parts manual",
              fileUrl: manualUrl,
            },
          }),
        ]
      : []),
    ...toCreate.map((p) =>
      prisma.part.create({
        data: {
          equipmentId,
          name: p.name,
          partNumber: p.partNumber,
          refNumber: p.refNumber,
          qty: p.qty,
        },
      })
    ),
  ]);

  revalidatePath(`/dashboard/admin/equipment/${equipmentId}`);
  revalidatePath(`/equipment/${equipmentId}`);

  return {
    ok: true,
    added: toCreate.length,
    skipped: chosen.length - toCreate.length,
    manualAttached: shouldAttach,
  };
}
