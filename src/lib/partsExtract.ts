// Reads an OEM manual PDF and pulls out its replacement-parts list, so a unit's
// PARTS tab can be populated from the manual instead of typed out by hand.
//
// Nothing here writes to the database — it returns *candidates* for review.
// The admin editor shows every candidate unchecked, and only what gets ticked
// is saved (see PartsFromManual.tsx / importParts). That's deliberate: a full
// OEM parts list runs to hundreds of rows, most of which nobody stocks.

import Anthropic from "@anthropic-ai/sdk";
import { PDFDocument } from "pdf-lib";

export type PartCandidate = {
  name: string;
  partNumber: string;
  /** Exploded-diagram callout, e.g. "14" or "A-3". Null when the manual has none. */
  refNumber: string | null;
  /** Quantity used on the unit, as printed ("1", "2", "AR"). Null when absent. */
  qty: string | null;
};

export type ExtractPartsResult =
  | {
      ok: true;
      parts: PartCandidate[];
      /** Inclusive 1-based page range actually sent to the model. */
      pagesRead: { from: number; to: number };
      pageCount: number;
    }
  | { ok: false; error: string };

// A PDF page costs roughly 2k tokens once Claude rasterizes and reads it, so
// the page budget is really a cost budget. 150 pages covers essentially every
// commercial-kitchen service manual in one pass.
const MAX_PAGES = 150;
// Sent one chunk per request: keeps any single request comfortably small, and
// means one failed chunk doesn't lose the parts found in the others.
const CHUNK_PAGES = 50;
const MAX_BYTES = 30 * 1024 * 1024;

const RECORD_TOOL: Anthropic.Tool = {
  name: "record_parts",
  description:
    "Record the replacement/service parts listed in an equipment manual's parts list or exploded-diagram legend.",
  input_schema: {
    type: "object" as const,
    properties: {
      parts: {
        type: "array",
        description:
          "One entry per part actually listed in the manual. Include every part in the parts list — do not filter for importance. If the manual has no parts list, return an empty array.",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description:
                "The part's description as printed, e.g. \"Door Gasket\", \"High Limit Thermostat\". Title-case it, but don't invent wording that isn't there.",
            },
            partNumber: {
              type: "string",
              description:
                "The manufacturer's order/part number exactly as printed, including any dashes or letters.",
            },
            refNumber: {
              type: "string",
              description:
                "The exploded-diagram callout or item number for this part, e.g. \"14\" or \"A-3\". Omit if the manual doesn't use callouts.",
            },
            qty: {
              type: "string",
              description:
                "Quantity used on the unit exactly as printed, e.g. \"1\", \"2\", \"AR\". Omit if not listed.",
            },
          },
          required: ["name", "partNumber"],
        },
      },
    },
    required: ["parts"],
  },
};

const PROMPT =
  "This is an equipment service/parts manual. Find its replacement-parts list " +
  "(often titled PARTS LIST, REPLACEMENT PARTS, SERVICE PARTS, or the legend " +
  "beside an exploded diagram) and call record_parts with every part it lists.\n\n" +
  "Rules:\n" +
  "- Read only what's printed. Never invent or guess a part number.\n" +
  "- Skip anything that isn't an orderable part: tools, wiring-diagram labels, " +
  "accessories tables that are really other model numbers, and the unit's own " +
  "model numbers.\n" +
  "- If the same part appears on more than one page or diagram, list it once.\n" +
  "- If there's no parts list in these pages, return an empty array.";

export async function fetchManualPdf(
  url: string
): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "That doesn't look like a valid link." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    return { ok: false, error: "Manual links have to be http or https." };

  let response: Response;
  try {
    response = await fetch(parsed, { redirect: "follow" });
  } catch {
    return { ok: false, error: "Couldn't reach that link — check it and try again." };
  }
  if (!response.ok)
    return {
      ok: false,
      error: `That link returned ${response.status} — it may need a login, or the file moved.`,
    };

  const contentType = response.headers.get("content-type") ?? "";
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES)
    return { ok: false, error: "That PDF is too big — keep it under 30 MB." };
  // Some vendor sites serve PDFs as application/octet-stream, so trust the
  // file's own magic bytes over the header when they disagree.
  if (!buffer.subarray(0, 5).toString("latin1").startsWith("%PDF-"))
    return {
      ok: false,
      error: contentType.includes("html")
        ? "That link opened a web page, not a PDF. Link straight to the PDF file."
        : "That file isn't a PDF.",
    };
  return { ok: true, buffer };
}

export async function extractPartsFromPdf(
  pdfBuffer: Buffer
): Promise<ExtractPartsResult> {
  if (!process.env.ANTHROPIC_API_KEY)
    return {
      ok: false,
      error:
        "Reading manuals needs ANTHROPIC_API_KEY set in the Vercel project — see Settings for which keys are wired up.",
    };
  if (pdfBuffer.byteLength > MAX_BYTES)
    return { ok: false, error: "That PDF is too big — keep it under 30 MB." };

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  } catch {
    return { ok: false, error: "Couldn't open that PDF — it may be corrupt or password-protected." };
  }
  const pageCount = doc.getPageCount();
  if (pageCount === 0) return { ok: false, error: "That PDF has no pages." };

  // Over budget: read the *back* of the manual. Parts lists and exploded
  // diagrams live at the end far more often than the front, and the UI reports
  // the exact page range so a wrong guess is obvious and fixable by uploading
  // just the parts section.
  const from = pageCount > MAX_PAGES ? pageCount - MAX_PAGES : 0; // 0-based
  const to = pageCount; // exclusive

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const found: PartCandidate[] = [];
  const seen = new Set<string>();
  let anyChunkSucceeded = false;
  let lastError: string | null = null;

  for (let start = from; start < to; start += CHUNK_PAGES) {
    const end = Math.min(start + CHUNK_PAGES, to);
    let chunkBase64: string;
    try {
      chunkBase64 =
        from === 0 && to === pageCount && pageCount <= CHUNK_PAGES
          ? pdfBuffer.toString("base64")
          : await sliceToBase64(doc, start, end);
    } catch (err) {
      console.error("[partsExtract] failed to slice pages", start, end, err);
      lastError = "Couldn't read part of that PDF.";
      continue;
    }

    try {
      const message = await anthropic.messages.create({
        model: "claude-opus-5",
        max_tokens: 16000,
        tools: [RECORD_TOOL],
        tool_choice: { type: "tool", name: "record_parts" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: chunkBase64,
                },
              },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      });

      const toolUse = message.content.find((block) => block.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        lastError = "The manual reader didn't return anything usable.";
        continue;
      }
      anyChunkSucceeded = true;
      const input = toolUse.input as { parts?: unknown };
      for (const candidate of normalizeParts(input.parts)) {
        const key = candidate.partNumber.toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (!key || seen.has(key)) continue;
        seen.add(key);
        found.push(candidate);
      }
    } catch (err) {
      console.error("[partsExtract] Claude request failed:", err);
      lastError = "The manual reader errored — try again in a moment.";
    }
  }

  if (!anyChunkSucceeded)
    return { ok: false, error: lastError ?? "Couldn't read that manual." };

  return {
    ok: true,
    parts: found,
    pagesRead: { from: from + 1, to },
    pageCount,
  };
}

// pdf-lib copies pages into a fresh document so each request carries only the
// pages in that chunk (a whole 150-page file per request would be wasteful and
// would blow the request size limit on image-heavy manuals).
async function sliceToBase64(
  source: PDFDocument,
  start: number,
  end: number
): Promise<string> {
  const slice = await PDFDocument.create();
  const pages = await slice.copyPages(
    source,
    Array.from({ length: end - start }, (_, i) => start + i)
  );
  pages.forEach((page) => slice.addPage(page));
  return Buffer.from(await slice.save()).toString("base64");
}

function normalizeParts(raw: unknown): PartCandidate[] {
  if (!Array.isArray(raw)) return [];
  const out: PartCandidate[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const partNumber =
      typeof row.partNumber === "string" ? row.partNumber.trim() : "";
    if (!name || !partNumber) continue;
    out.push({
      name,
      partNumber,
      refNumber:
        typeof row.refNumber === "string" && row.refNumber.trim()
          ? row.refNumber.trim()
          : null,
      qty: typeof row.qty === "string" && row.qty.trim() ? row.qty.trim() : null,
    });
  }
  return out;
}
