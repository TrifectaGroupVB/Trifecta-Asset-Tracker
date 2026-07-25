import JSZip from "jszip";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hasDashboardSession } from "@/lib/session";
import {
  buildPrinterReadme,
  buildStickerCsv,
  renderStickerTemplatePdf,
} from "@/lib/stickerVectorExport";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

// Print-vendor handoff: one VECTOR sticker template (PDF, fonts outlined, with
// bleed + crop marks) plus a CSV of per-sticker data, zipped. The vendor merges
// the template against the CSV and generates the square QR codes themselves —
// see buildPrinterReadme / stickerVectorExport.ts for the full spec. Separate
// from the raster-PNG export route next door.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchNumber: string }> }
) {
  if (!(await hasDashboardSession())) {
    return NextResponse.redirect(new URL("/dashboard", BASE_URL));
  }

  const { batchNumber } = await params;
  const batch = await prisma.tagBatch.findUnique({
    where: { batchNumber: Number(batchNumber) },
    include: {
      tags: { where: { voided: false }, orderBy: { code: "asc" } },
      restaurant: true,
    },
  });
  if (!batch) return new NextResponse("Batch not found", { status: 404 });

  const logoUrl = batch.restaurant.printLogoUrl ?? batch.restaurant.logoUrl;
  const [pdf, csv, readme] = [
    await renderStickerTemplatePdf({ restaurantName: batch.restaurant.name, logoUrl }),
    buildStickerCsv(batch.tags, BASE_URL),
    buildPrinterReadme({
      restaurantName: batch.restaurant.name,
      batchNumber: batch.batchNumber,
      tagCount: batch.tags.length,
    }),
  ];

  const zip = new JSZip();
  zip.file("sticker-template.pdf", pdf);
  zip.file("stickers.csv", csv);
  zip.file("README-for-printer.txt", readme);
  const zipBuffer = await zip.generateAsync({ type: "uint8array" });
  // Re-copy into a plain ArrayBuffer-backed Uint8Array (see export/route.ts).
  const body = Uint8Array.from(zipBuffer);

  return new NextResponse(new Blob([body]), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="batch-${batch.batchNumber}-print-vendor.zip"`,
    },
  });
}
