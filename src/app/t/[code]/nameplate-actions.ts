"use server";

import { parseNameplatePhoto, type NameplateResult } from "@/lib/nameplate";
import { hasDashboardSession } from "@/lib/session";
import { isFeatureEnabled } from "@/lib/settings";

export type ScanNameplateResult =
  | { ok: true; data: NameplateResult }
  | { ok: false; error: string };

// Reads a data-plate photo and hands the fields back to the wizard to
// prefill. Deliberately does NOT write anything — the wizard shows every
// field for review, and creation still goes through
// createEquipmentAndAssignTag like a hand-typed unit.
export async function scanNameplate(
  formData: FormData
): Promise<ScanNameplateResult> {
  if (!(await hasDashboardSession()))
    return { ok: false, error: "Session expired — reload and enter the PIN again." };
  if (!(await isFeatureEnabled("nameplateScan")))
    return { ok: false, error: "Nameplate scanning is switched off in Settings." };

  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0)
    return { ok: false, error: "Take a photo of the data plate first." };
  if (photo.size > 20 * 1024 * 1024)
    return { ok: false, error: "That photo is too big — keep it under 20 MB." };

  const buffer = Buffer.from(await photo.arrayBuffer());
  return parseNameplatePhoto(buffer, photo.type);
}
