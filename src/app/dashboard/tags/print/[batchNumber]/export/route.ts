import JSZip from "jszip";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hasDashboardSession } from "@/lib/session";
import { renderBatchStickerPngs } from "@/lib/stickerExport";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

// Bundles every sticker in a batch as an individual 300 DPI PNG in a ZIP —
// for handing off to an outside vinyl sticker printer, since each sticker
// encodes a different QR code and most print vendors want one file per
// unique design.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchNumber: string }> }
) {
  if (!(await hasDashboardSession())) {
    return NextResponse.redirect(new URL("/dashboard", BASE_URL));
  }

  const { batchNumber } = await params;
  const [batch, restaurantNameSetting] = await Promise.all([
    prisma.tagBatch.findUnique({
      where: { batchNumber: Number(batchNumber) },
      include: { tags: { where: { voided: false }, orderBy: { code: "asc" } } },
    }),
    prisma.setting.findUnique({ where: { key: "restaurantName" } }),
  ]);
  if (!batch) return new NextResponse("Batch not found", { status: 404 });

  const restaurantName = restaurantNameSetting?.value ?? "Trifecta";
  const stickers = await renderBatchStickerPngs(batch.tags, BASE_URL, restaurantName);

  const zip = new JSZip();
  for (const s of stickers) {
    zip.file(`${s.code}.png`, s.png);
  }
  const zipBuffer = await zip.generateAsync({ type: "uint8array" });
  // Re-copy into a plain ArrayBuffer-backed Uint8Array — JSZip's output type
  // param is generic over ArrayBufferLike (incl. SharedArrayBuffer), which
  // doesn't satisfy BodyInit's stricter ArrayBuffer-only typing.
  const body = Uint8Array.from(zipBuffer);

  return new NextResponse(new Blob([body]), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="batch-${batch.batchNumber}-stickers.zip"`,
    },
  });
}
