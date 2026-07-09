import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { PinGate } from "@/components/dashboard/PinGate";
import { PrintButton } from "@/components/tags/PrintButton";
import { prisma } from "@/lib/db";
import { hasDashboardSession } from "@/lib/session";

// Sticker dimensions here MUST stay in sync with the constants in
// src/lib/stickerExport.ts (Tailwind arbitrary-value classes can't reference
// a shared JS constant, so these are kept in sync by hand).

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

export default async function PrintBatchPage({
  params,
}: {
  params: Promise<{ batchNumber: string }>;
}) {
  if (!(await hasDashboardSession())) return <PinGate />;

  const { batchNumber } = await params;
  const [batch, restaurantName] = await Promise.all([
    prisma.tagBatch.findUnique({
      where: { batchNumber: Number(batchNumber) },
      include: { tags: { where: { voided: false }, orderBy: { code: "asc" } } },
    }),
    prisma.setting
      .findUnique({ where: { key: "restaurantName" } })
      .then((s) => s?.value ?? "Trifecta"),
  ]);
  if (!batch) notFound();

  const stickers = await Promise.all(
    batch.tags.map(async (tag) => ({
      code: tag.code,
      // Pure black on white — these get laminated in a kitchen
      svg: await QRCode.toString(`${BASE_URL}/t/${tag.code}`, {
        type: "svg",
        margin: 0,
        color: { dark: "#000000", light: "#ffffff" },
      }),
    }))
  );

  return (
    <main className="p-4 print:p-0">
      <div className="mb-4 flex items-center gap-3 print:hidden">
        <Link
          href="/dashboard/tags"
          className="flex min-h-12 items-center font-display uppercase tracking-wide text-text-muted"
        >
          ‹ Tags
        </Link>
        <h1 className="flex-1 font-display text-xl font-semibold uppercase tracking-wide">
          Batch #{batch.batchNumber} — {batch.tags.length} stickers
        </h1>
        <a
          href={`/dashboard/tags/print/${batch.batchNumber}/export`}
          className="flex h-12 items-center rounded-sm border border-border px-4 font-display uppercase tracking-wide text-text-muted"
        >
          Download Images
        </a>
        <PrintButton />
      </div>

      {/* The sheet: white even on screen so what you see is what prints */}
      <div className="mx-auto flex max-w-[8.5in] flex-wrap bg-white p-2 print:max-w-none print:p-0">
        {stickers.map((s) => (
          <div
            key={s.code}
            className="flex h-[3.4in] w-[2.5in] flex-col items-center justify-center border border-dashed border-[#999] break-inside-avoid"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/watermans-logo-full.png"
              alt=""
              className="h-auto w-[2.1in] object-contain"
            />
            <div
              aria-hidden
              className="mt-[0.05in] size-[1.25in] [&_svg]:size-full"
              dangerouslySetInnerHTML={{ __html: s.svg }}
            />
            <p className="mt-[0.06in] font-mono text-[11pt] leading-none tracking-[0.08em] text-black">
              {s.code}
            </p>
            <p className="mt-[0.05in] max-w-[1.85in] truncate font-display text-[6.5pt] font-bold uppercase leading-none tracking-[0.14em] text-black">
              {restaurantName}
            </p>
            <p className="mt-[0.035in] font-display text-[7pt] font-bold uppercase leading-none tracking-[0.3em] text-black">
              Scan Me
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
