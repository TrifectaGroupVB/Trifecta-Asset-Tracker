// Reads an equipment nameplate / data-tag photo into structured fields.
//
// Modeled on the working implementation in ScanSticker's live workspace
// (`fresh-release-workspace`), not its older `app/` copy. Two lessons from
// that product are baked in here because both were learned the hard way in
// the field:
//
//   1. Phone photos must be normalized before they reach the model. An iPhone
//      shoots HEIC by default, which the vision API can't read at all — this
//      was ScanSticker's single most common scanner failure. Every photo is
//      converted to a downsized JPEG first.
//   2. There is no usable no-key fallback. Local OCR (tesseract) cannot run in
//      a serverless runtime; carrying it only produced a confusing error at
//      the moment someone was standing in front of a machine. With no API key
//      the scanner is simply off, and the wizard says so up front.
//
// The two products keep separate copies on purpose — improvements here don't
// automatically flow back, and vice versa.

import sharp from "sharp";

export type NameplateSpec = { label: string; value: string };

export type NameplateResult = {
  name: string | null;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  specs: NameplateSpec[];
};

export type NameplateFailureReason =
  | "no_photo"
  | "file_too_large"
  | "unsupported_format"
  | "conversion_failed"
  | "vision_failed"
  | "scanner_disabled"
  | "session_expired";

export type ParseNameplateResult =
  | { ok: true; data: NameplateResult }
  | { ok: false; reason: NameplateFailureReason; error: string };

const VALID_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ValidMimeType = (typeof VALID_MIME_TYPES)[number];

// Formats a phone hands us that the parser can't read directly but we can
// convert. HEIC is the iPhone default and the one that matters most.
const CONVERTIBLE_UNSUPPORTED = ["image/heic", "image/heif", "image/avif"];

// Reading a plate is a straightforward OCR-style vision task, so the default is
// the cheap model — roughly a third the cost of Sonnet per scan. Override with
// ANTHROPIC_NAMEPLATE_MODEL if a batch of hard plates ever needs the stronger
// one; no code change required.
const NAMEPLATE_VISION_MODEL =
  process.env.ANTHROPIC_NAMEPLATE_MODEL || "claude-haiku-4-5-20251001";

// The scanner IS the Claude-vision path. On or off, nothing in between.
export function isNameplateScannerEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Shown wherever someone reaches the scanner with no key configured. Calm and
// actionable — typing the fields in is always right there underneath.
export const SCANNER_DISABLED_COPY =
  "Photo scan isn't turned on yet. You can still finish setup by typing the fields below.";

/** Does the parser accept this MIME type as-is? */
export function isSupportedNameplateMime(mimeType: string): boolean {
  return VALID_MIME_TYPES.includes(mimeType.toLowerCase() as ValidMimeType);
}

function isConvertibleMime(mimeType: string): boolean {
  return CONVERTIBLE_UNSUPPORTED.includes(mimeType.toLowerCase());
}

/** Copy for a format we can't read even after trying to convert. */
export function describeUnsupportedFormat(mimeType: string): string {
  if (isConvertibleMime(mimeType)) {
    return "We couldn't convert that photo. Retake it as a JPEG, or fill the fields in by hand.";
  }
  return "The scanner reads JPEG, PNG, HEIC, and WebP photos. Retake it in one of those, or fill the fields in by hand.";
}

// Reason code plus a short safe detail only — never the image bytes, the photo
// itself, or anything from the environment.
function logFailure(reason: NameplateFailureReason, detail?: string): void {
  console.error("[nameplate] failed", { reason, ...(detail ? { detail } : {}) });
}

function safeErrorDetail(err: unknown): string {
  return err instanceof Error ? `err=${err.name}` : "err=unknown";
}

/**
 * Normalize any phone photo into a transient JPEG for parsing. Not persisted —
 * this is a parser input only, and the original upload is untouched.
 *
 * HEIC/HEIF is decoded by heic-convert (libheif WASM) rather than sharp:
 * sharp's bundled libheif has no HEVC decoder, so it cannot open an iPhone
 * photo at all. AVIF and everything else go through sharp.
 *
 * Also fixes the two things that quietly wreck accuracy: EXIF rotation (a
 * sideways plate reads badly) and size (a 12 MP photo is far more data than
 * the model needs to read stamped text).
 */
export async function convertToParserJpeg(
  imageBuffer: Buffer,
  mimeType: string
): Promise<{ ok: true; buffer: Buffer } | { ok: false }> {
  try {
    let decoded = imageBuffer;
    const lower = mimeType.toLowerCase();
    if (lower === "image/heic" || lower === "image/heif") {
      const heicConvert = (await import("heic-convert")).default;
      const jpeg = await heicConvert({ buffer: imageBuffer, format: "JPEG", quality: 0.9 });
      decoded = Buffer.from(jpeg);
    }
    const out = await sharp(decoded)
      .rotate() // honor EXIF orientation
      .resize({ width: 2200, height: 2200, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();
    return { ok: true, buffer: out };
  } catch (err) {
    logFailure("conversion_failed", safeErrorDetail(err));
    return { ok: false };
  }
}

// Entry point. Every photo is normalized to a downsized JPEG first, whatever
// format it arrived in — that's what makes the scan work on a phone rather
// than only on a file someone already converted by hand.
export async function parseNameplatePhoto(
  imageBuffer: Buffer,
  mimeType: string
): Promise<ParseNameplateResult> {
  if (!isNameplateScannerEnabled()) {
    logFailure("scanner_disabled");
    return { ok: false, reason: "scanner_disabled", error: SCANNER_DISABLED_COPY };
  }

  if (!isSupportedNameplateMime(mimeType) && !isConvertibleMime(mimeType)) {
    logFailure("unsupported_format", `mime=${mimeType}`);
    return {
      ok: false,
      reason: "unsupported_format",
      error: describeUnsupportedFormat(mimeType),
    };
  }

  // Everything gets converted, not just the formats the API rejects: the
  // rotation and downsizing matter just as much for an oversized JPEG
  // straight off a phone as they do for a HEIC.
  const converted = await convertToParserJpeg(imageBuffer, mimeType);
  if (!converted.ok) {
    return {
      ok: false,
      reason: "conversion_failed",
      error: describeUnsupportedFormat(mimeType),
    };
  }

  return parseWithClaudeVision(converted.buffer);
}

const RECORD_TOOL = {
  name: "record_nameplate",
  description: "Record the fields read off an equipment nameplate/data tag photo.",
  input_schema: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description:
          'A short equipment type/name if identifiable from the plate or unit style — e.g. "Walk-in Cooler", "Rooftop Unit", "Fryer". Omit if not confidently identifiable.',
      },
      manufacturer: { type: "string", description: "Brand/manufacturer name as printed." },
      model: { type: "string", description: "Model number exactly as printed." },
      serial: { type: "string", description: "Serial number exactly as printed." },
      specs: {
        type: "array",
        description:
          "Every other printed spec worth keeping — voltage, phase, hertz, amperage, refrigerant type, BTU/tonnage, capacity, filter size, manufacture date, etc. One entry per line item actually printed on the plate.",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            value: { type: "string" },
          },
          required: ["label", "value"],
        },
      },
    },
    required: ["specs"],
  },
};

const VISION_FAILED_COPY =
  "The scanner couldn't read this photo. Try another shot with less glare, or fill the fields in by hand.";

async function parseWithClaudeVision(
  imageBuffer: Buffer
): Promise<ParseNameplateResult> {
  try {
    // Loaded here rather than at module scope: every server-rendered route
    // shares one bundle, and heavy top-level imports have taken this app's
    // pages down on Vercel before.
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: NAMEPLATE_VISION_MODEL,
      max_tokens: 1024,
      tools: [RECORD_TOOL],
      tool_choice: { type: "tool", name: "record_nameplate" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: imageBuffer.toString("base64"),
              },
            },
            {
              type: "text",
              text:
                "This is a photo of a commercial kitchen equipment nameplate or data tag. Read only what's actually printed — never guess or infer a value that isn't legible. Call record_nameplate with what you can confidently read.",
            },
          ],
        },
      ],
    });

    const toolUse = message.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      logFailure("vision_failed", "no_tool_use");
      return { ok: false, reason: "vision_failed", error: VISION_FAILED_COPY };
    }

    const input = toolUse.input as Partial<NameplateResult>;
    return {
      ok: true,
      data: {
        name: input.name?.trim() || null,
        manufacturer: input.manufacturer?.trim() || null,
        model: input.model?.trim() || null,
        serial: input.serial?.trim() || null,
        specs: Array.isArray(input.specs)
          ? input.specs.filter((s) => s?.label && s?.value)
          : [],
      },
    };
  } catch (err) {
    logFailure("vision_failed", safeErrorDetail(err));
    return { ok: false, reason: "vision_failed", error: VISION_FAILED_COPY };
  }
}
