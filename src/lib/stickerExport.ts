import { readFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import sharp, { type OverlayOptions } from "sharp";

// Physical layout MUST stay in sync with the on-screen sticker markup in
// src/app/dashboard/tags/print/[batchNumber]/page.tsx (Tailwind arbitrary
// values can't reference a shared JS constant, so these are hand-matched).
const DPI = 300;
const STICKER_WIDTH_IN = 2.5;
const STICKER_HEIGHT_IN = 3.4;
const LOGO_WIDTH_IN = 2.1;
const QR_SIZE_IN = 1.25;
const GAP_LOGO_QR_IN = 0.05;
const GAP_QR_CODE_IN = 0.06;
const GAP_CODE_NAME_IN = 0.05;
const GAP_NAME_SCAN_IN = 0.035;

const CODE_FONT_PT = 11;
const NAME_FONT_PT = 8;
const SCAN_FONT_PT = 8.5;

function inToPx(inches: number): number {
  return Math.round(inches * DPI);
}
function ptToPx(pt: number): number {
  return Math.round((pt / 72) * DPI);
}

// One centered line of text, rendered on its own transparent-background
// canvas so it composites cleanly onto the sticker's white background.
async function renderTextLine(
  text: string,
  {
    widthPx,
    fontPx,
    bold,
    mono,
    letterSpacingPx,
  }: { widthPx: number; fontPx: number; bold: boolean; mono: boolean; letterSpacingPx: number }
): Promise<{ buffer: Buffer; heightPx: number }> {
  const heightPx = Math.round(fontPx * 1.3);
  const family = mono ? "monospace" : "sans-serif";
  const weight = bold ? "bold" : "normal";
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}">
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
      font-family="${family}" font-size="${fontPx}" font-weight="${weight}"
      letter-spacing="${letterSpacingPx}" fill="#000000">${escaped}</text>
  </svg>`;
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return { buffer, heightPx };
}

async function loadLogo(): Promise<Buffer> {
  return readFile(
    path.join(process.cwd(), "public", "brand", "watermans-logo-full.png")
  );
}

export async function renderStickerPng(opts: {
  code: string;
  qrUrl: string;
  restaurantName: string;
  logoBuffer: Buffer;
}): Promise<Buffer> {
  const { code, qrUrl, restaurantName, logoBuffer } = opts;

  const canvasW = inToPx(STICKER_WIDTH_IN);
  const canvasH = inToPx(STICKER_HEIGHT_IN);

  // Logo, resized to target width, aspect preserved.
  const logo = await sharp(logoBuffer)
    .resize({ width: inToPx(LOGO_WIDTH_IN) })
    .png()
    .toBuffer();
  const logoMeta = await sharp(logo).metadata();
  const logoH = logoMeta.height ?? inToPx(LOGO_WIDTH_IN / 1.6);
  const logoW = logoMeta.width ?? inToPx(LOGO_WIDTH_IN);

  // QR, rasterized crisp (nearest-neighbor) so module edges stay pure
  // black/white rather than anti-aliased gray — better for vinyl print.
  const qrSvg = await QRCode.toString(qrUrl, {
    type: "svg",
    margin: 0,
    color: { dark: "#000000", light: "#ffffff" },
  });
  const qrPx = inToPx(QR_SIZE_IN);
  const qr = await sharp(Buffer.from(qrSvg), { density: DPI })
    .resize(qrPx, qrPx, { kernel: "nearest" })
    .png()
    .toBuffer();

  const codeLine = await renderTextLine(code, {
    widthPx: canvasW,
    fontPx: ptToPx(CODE_FONT_PT),
    bold: false,
    mono: true,
    letterSpacingPx: 2,
  });
  const nameLine = await renderTextLine(restaurantName.toUpperCase(), {
    widthPx: canvasW,
    fontPx: ptToPx(NAME_FONT_PT),
    bold: true,
    mono: false,
    letterSpacingPx: 1,
  });
  const scanLine = await renderTextLine("SCAN ME", {
    widthPx: canvasW,
    fontPx: ptToPx(SCAN_FONT_PT),
    bold: true,
    mono: false,
    letterSpacingPx: 3,
  });

  const contentHeight =
    logoH +
    inToPx(GAP_LOGO_QR_IN) +
    qrPx +
    inToPx(GAP_QR_CODE_IN) +
    codeLine.heightPx +
    inToPx(GAP_CODE_NAME_IN) +
    nameLine.heightPx +
    inToPx(GAP_NAME_SCAN_IN) +
    scanLine.heightPx;

  // Center the whole stack vertically within the sticker, mirroring the
  // browser version's `justify-center` on a fixed-height flex box.
  let y = Math.max(0, Math.round((canvasH - contentHeight) / 2));

  const composites: OverlayOptions[] = [];
  const centerX = (width: number) => Math.round((canvasW - width) / 2);

  composites.push({ input: logo, left: centerX(logoW), top: y });
  y += logoH + inToPx(GAP_LOGO_QR_IN);

  composites.push({ input: qr, left: centerX(qrPx), top: y });
  y += qrPx + inToPx(GAP_QR_CODE_IN);

  composites.push({ input: codeLine.buffer, left: 0, top: y });
  y += codeLine.heightPx + inToPx(GAP_CODE_NAME_IN);

  composites.push({ input: nameLine.buffer, left: 0, top: y });
  y += nameLine.heightPx + inToPx(GAP_NAME_SCAN_IN);

  composites.push({ input: scanLine.buffer, left: 0, top: y });

  return sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

export async function renderBatchStickerPngs(
  tags: { code: string }[],
  baseUrl: string,
  restaurantName: string
): Promise<{ code: string; png: Buffer }[]> {
  const logoBuffer = await loadLogo();
  return Promise.all(
    tags.map(async (tag) => ({
      code: tag.code,
      png: await renderStickerPng({
        code: tag.code,
        qrUrl: `${baseUrl}/t/${tag.code}`,
        restaurantName,
        logoBuffer,
      }),
    }))
  );
}
