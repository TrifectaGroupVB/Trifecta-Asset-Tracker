"use server";

import {
  parseNameplatePhoto,
  type ParseNameplateResult,
} from "@/lib/nameplate";
import { hasDashboardSession } from "@/lib/session";
import { isFeatureEnabled } from "@/lib/settings";

export type ScanNameplateResult = ParseNameplateResult;

// A phone photo of a data plate, straight off the camera. The parser handles
// converting and downsizing it — nothing here should assume the file is
// already a small JPEG, because on an iPhone it never is.
const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

// Reads a data-plate photo and hands the fields back to the wizard to
// prefill. Deliberately does NOT write anything — the wizard shows every
// field for review, and creation still goes through
// createEquipmentAndAssignTag like a hand-typed unit.
export async function scanNameplate(
  formData: FormData
): Promise<ScanNameplateResult> {
  if (!(await hasDashboardSession()))
    return {
      ok: false,
      reason: "session_expired",
      error: "Session expired — reload and enter the PIN again.",
    };
  if (!(await isFeatureEnabled("nameplateScan")))
    return {
      ok: false,
      reason: "scanner_disabled",
      error: "Nameplate scanning is switched off in Settings.",
    };

  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0)
    return {
      ok: false,
      reason: "no_photo",
      error: "Take a photo of the data plate first.",
    };
  if (photo.size > MAX_PHOTO_BYTES)
    return {
      ok: false,
      reason: "file_too_large",
      error: "That photo is too big — keep it under 20 MB.",
    };

  const buffer = Buffer.from(await photo.arrayBuffer());
  return parseNameplatePhoto(buffer, photo.type);
}
