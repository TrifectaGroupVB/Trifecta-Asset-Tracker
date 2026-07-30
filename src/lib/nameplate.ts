// Reads an equipment nameplate / data-tag photo into structured fields.
// Ported from the ScanSticker app (its own copy stays the source of truth
// for that product — the two are deliberately separate, so improvements
// here don't automatically flow back and vice versa).

// Both the Anthropic SDK and tesseract.js are loaded lazily, inside the
// functions that need them, and never at module scope. tesseract.js in
// particular drags in worker and wasm assets that don't survive being traced
// into a serverless bundle — importing it at the top of this file took down
// every server-rendered route on Vercel, not just the scan itself, because
// they share one server bundle. Locally (dev and a production build) it was
// invisible, since the files are right there on disk.

export type NameplateSpec = { label: string; value: string };

export type NameplateResult = {
  name: string | null;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  specs: NameplateSpec[];
};

export type ParseNameplateResult =
  | { ok: true; data: NameplateResult }
  | { ok: false; error: string };

const VALID_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ValidMimeType = (typeof VALID_MIME_TYPES)[number];

// Entry point — Claude vision reads the plate *and* understands which text
// is which field, so it's the default whenever a key is configured. Without
// one, this falls back to fully local OCR (see parseWithOCR below) — no
// external service, no key, works out of the box. If a key gets added
// later, parsing quietly gets better with no other changes needed.
export async function parseNameplatePhoto(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<ParseNameplateResult> {
  if (!VALID_MIME_TYPES.includes(mimeType as ValidMimeType)) {
    return { ok: false, error: "That photo format isn't supported — try a JPEG or PNG." };
  }

  if (process.env.ANTHROPIC_API_KEY) {
    const visionResult = await parseWithClaudeVision(imageBuffer, mimeType as ValidMimeType);
    if (visionResult.ok && hasAnyNameplateData(visionResult.data)) {
      return visionResult;
    }

    // Vision should be best, but the field workflow should not collapse when
    // the external model has a transient issue or returns an empty tool call.
    const ocrResult = await parseWithOCR(imageBuffer);
    return ocrResult.ok ? ocrResult : visionResult;
  }
  return parseWithOCR(imageBuffer);
}

const RECORD_TOOL = {
  name: "record_nameplate",
  description:
    "Record the fields read off an equipment nameplate/data tag photo.",
  input_schema: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description:
          "A short equipment type/name if identifiable from the plate or unit style — e.g. \"Walk-in Cooler\", \"Rooftop Unit\", \"Treadmill\". Omit if not confidently identifiable.",
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

async function parseWithClaudeVision(
  imageBuffer: Buffer,
  mimeType: ValidMimeType,
): Promise<ParseNameplateResult> {
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: "claude-opus-5",
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
                media_type: mimeType,
                data: imageBuffer.toString("base64"),
              },
            },
            {
              type: "text",
              text:
                "This is a photo of a commercial equipment nameplate or data tag. Read only what's actually printed — never guess or infer a value that isn't legible. Call record_nameplate with what you can confidently read.",
            },
          ],
        },
      ],
    });

    const toolUse = message.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return { ok: false, error: "Couldn't read that photo — try again with better light." };
    }

    const input = toolUse.input as Partial<NameplateResult>;
    return {
      ok: true,
      data: cleanNameplateResult({
        name: input.name?.trim() || null,
        manufacturer: input.manufacturer?.trim() || null,
        model: input.model?.trim() || null,
        serial: input.serial?.trim() || null,
        specs: Array.isArray(input.specs)
          ? input.specs.filter((s) => s?.label && s?.value)
          : [],
      }),
    };
  } catch (err) {
    console.error("[nameplate] Claude vision parse failed:", err);
    return { ok: false, error: "Couldn't read that photo — try again with better light." };
  }
}

// Zero-config fallback: local OCR (tesseract.js, no external service) plus
// regex heuristics over the raw recognized text. Meaningfully less reliable
// than the vision model above — no understanding of layout or context, just
// pattern-matching on common nameplate label wording — but it's free,
// self-contained, and needs nothing set up. The wizard always shows the
// result for review before saving, so an imperfect first pass here still
// beats typing everything from scratch.
async function parseWithOCR(imageBuffer: Buffer): Promise<ParseNameplateResult> {
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    let text: string;
    try {
      const result = await worker.recognize(imageBuffer);
      text = result.data.text;
    } finally {
      await worker.terminate();
    }

    const data = extractFieldsFromText(text);
    if (!data.manufacturer && !data.model && !data.serial && data.specs.length === 0) {
      return {
        ok: false,
        error:
          "Couldn't make out any labels on that photo — try again with better light and less glare, or fill it in by hand.",
      };
    }
    return { ok: true, data };
  } catch (err) {
    console.error("[nameplate] OCR parse failed:", err);
    return { ok: false, error: "Couldn't read that photo — try again, or fill it in by hand." };
  }
}

// A modest, non-exhaustive list — enough to catch the common brands across
// HVAC/refrigeration, commercial kitchen, fitness, and cleaning equipment
// without a real "who makes this" understanding. First match wins.
const KNOWN_MANUFACTURERS = [
  "Trane", "Carrier", "Lennox", "York", "Rheem", "Ruud", "Goodman", "Daikin",
  "Mitsubishi Electric", "Bosch", "American Standard", "Heil", "AAON",
  "Greenheck", "CaptiveAire",
  "Hobart", "Vulcan", "True", "Hoshizaki", "Manitowoc", "Scotsman",
  "Traulsen", "Beverage-Air", "Frymaster", "Pitco", "Middleby", "Henny Penny",
  "Cambro", "Turbochef", "Blodgett", "Southbend", "Garland", "Wolf",
  "Vollrath", "Nemco", "Waring", "Hamilton Beach", "Bunn", "Follett",
  "Ice-O-Matic", "Delfield", "Continental", "Norlake", "Master-Bilt",
  "Kolpak", "Star", "APW Wyott", "La Marzocco", "Heatcraft", "Bohn",
  "Copeland", "Emerson", "Turbo Air", "Federal Industries", "Structural Concepts",
  "Tennant", "Nilfisk", "Advance", "Karcher", "Kärcher",
  "Life Fitness", "Precor", "Cybex", "Matrix", "Technogym",
] as const;

export function extractFieldsFromText(text: string): NameplateResult {
  const normalizedText = normalizeOcrText(text);
  const lines = normalizedText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const specs: NameplateSpec[] = [];
  const seen = new Set<string>();
  const addSpec = (label: string, value: string) => {
    const cleaned = cleanValue(value);
    if (!cleaned) return;
    const key = `${label}:${cleaned}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    specs.push({ label, value: cleaned });
  };

  const model = cleanIdentifierValue(
    matchLabeledValue(lines, /^(?:MODEL\s*(?:NO|NUMBER|#|CODE)?|CAT(?:ALOG)?\.?\s*NO|PART\s*NO|MOD\.?\s*(?:NO)?|MDL|M\/N|MN|P\/N|MODEL)\b/i) ??
      matchFirst(normalizedText, /\b(?:MODEL(?:\s*(?:NO|NUMBER|#|CODE))?|MOD\.?\s*(?:NO)?|MDL|M\/N|MN|CAT(?:ALOG)?\.?\s*NO|P\/N|PART\s*NO)\s*[:#=-]?\s*([A-Z0-9][A-Z0-9\-/.\s~]{2,})/i),
  );
  // S\/N is the single most common serial label on nameplates, and OCR
  // frequently misreads the thin "/" as "I" or "1" (SIN, S1N) — worth
  // hardening against specifically rather than relying on the generic
  // SERIAL/SER NO fallbacks catching it.
  const serial = cleanIdentifierValue(
    matchLabeledValue(lines, /^(?:SERIAL\s*(?:NO|NUMBER|#|NR)?|SER\.?\s*(?:NO|NR)?|S\/N|S\s*\/?\s*N|S[I1]N|SN|SERIAL|SER)\b/i) ??
      matchFirst(normalizedText, /\b(?:SERIAL(?:\s*(?:NO|NUMBER|#|NR))?|SER\.?\s*(?:NO|NR)?|S\/N|S\s*\/?\s*N|S[I1]N|SN)\s*[:#=-]?\s*([A-Z0-9][A-Z0-9\-/.\s~]{2,})/i),
  );

  const labeledManufacturer = matchLabeledValue(
    lines,
    /^(?:MANUFACTURER|MANUFACTURED\s+BY|MFR|MFG(?:\s+BY)?|MAKE|BRAND|COMPANY)\b/i,
  );
  const knownManufacturer =
    KNOWN_MANUFACTURERS.find((brand) => {
      const pattern = brandPattern(brand);
      return new RegExp(`\\b${pattern}\\b`, "i").test(normalizedText);
    }) ?? null;
  const manufacturer =
    cleanManufacturer(looksLikeManufacturerValue(labeledManufacturer) ? labeledManufacturer : null) ??
    knownManufacturer;

  const name = cleanValue(
    matchLabeledValue(lines, /^(?:EQUIPMENT|UNIT|TYPE|PRODUCT|DESCRIPTION)\b/i),
  );

  const electrical = extractElectricalTriplet(normalizedText);
  const voltage =
    electrical?.voltage ??
    matchFirst(normalizedText, /\b(\d{2,3}(?:[-/]\d{2,3})?\s*V(?:AC|OLTS?)?)\b/i) ??
    matchFirst(normalizedText, /\b(?:VOLTS?|VOLTAGE|ELECTRICAL|ELEC)\s*[:#=-]?\s*(\d{2,3}(?:-\d{2,3})?)(?:\s*[/,]\s*\d{2,3})?/i);
  if (voltage) {
    const normalizedVoltage = voltage.toUpperCase().replace(/\s+/g, "");
    addSpec("Voltage", /V/.test(normalizedVoltage) ? normalizedVoltage : `${normalizedVoltage}V`);
  }

  const phase =
    electrical?.phase ??
    matchFirst(normalizedText, /\b([13]\s*[-]?\s*PH(?:ASE)?)\b/i) ??
    matchFirst(normalizedText, /\b(?:VOLTS?|VOLTAGE|ELECTRICAL|ELEC)\s*[:#=-]?\s*\d{2,3}(?:[-/]\d{2,3})?\s*[/,]\s*\d{2,3}\s*[/,]\s*([13])\b/i);
  if (phase) {
    const normalizedPhase = phase.replace(/\s+/g, "").toUpperCase();
    addSpec("Phase", /^[13]$/.test(normalizedPhase) ? `${normalizedPhase}PH` : normalizedPhase);
  }

  const hertz =
    electrical?.hertz ??
    matchFirst(normalizedText, /\b(\d{2,3}\s*HZ)\b/i) ??
    matchFirst(normalizedText, /\b(?:VOLTS?|VOLTAGE|ELECTRICAL|ELEC)\s*[:#=-]?\s*\d{2,3}(?:[-/]\d{2,3})?\s*[/,]\s*(\d{2,3})\s*[/,]\s*[13]\b/i);
  if (hertz) {
    const normalizedHertz = hertz.replace(/\s+/g, "").toUpperCase();
    addSpec("Frequency", /HZ$/.test(normalizedHertz) ? normalizedHertz : `${normalizedHertz}HZ`);
  }

  // Negative lookbehind excludes refrigerant codes like "R-410A" — without
  // it this greedily matches the trailing digits+letter as an amp reading.
  const mca = matchFirst(
    normalizedText,
    /\b(?:MCA|MIN(?:IMUM)?\s+CIRCUIT\s+AMP(?:ACITY)?|MIN\.?\s+CKT\.?\s+AMP(?:ACITY)?)\s*[:#=-]?\s*(\d+(?:\.\d+)?\s*A?)\b/i,
  );
  if (mca) addSpec("Minimum circuit amps", normalizeAmpValue(mca));

  const maxFuse = matchFirst(
    normalizedText,
    /\b(?:MAX(?:IMUM)?\s+)?(?:FUSE\s+SIZE|FUSE|OCP|MOCP|MOP)\s*[:#=-]?\s*(\d+(?:\.\d+)?\s*(?:A|AMPS?)?)\b/i,
  );
  if (maxFuse) addSpec("Max fuse", normalizeAmpValue(maxFuse));

  const labeledAmperage = matchFirst(
    normalizedText,
    /\b(?:RLA|FLA|AMPS?|CURRENT)\s*[:#=-]?\s*(\d+(?:\.\d+)?\s*A?)\b/i,
  );
  const looseAmperage = matchFirst(
    normalizedText,
    /(?<![A-Z0-9])(\d+(?:\.\d+)?\s*A(?:MPS?)?)\b/i,
  );
  const amperage =
    labeledAmperage ??
    (looseAmperage &&
    !valueEqualsSpec(looseAmperage, mca) &&
    !valueEqualsSpec(looseAmperage, maxFuse) &&
    !looksLikeRefrigerantSlice(normalizedText, looseAmperage)
      ? looseAmperage
      : null);
  if (amperage) addSpec("Amperage", normalizeAmpValue(amperage));

  const refrigerant = matchFirst(normalizedText, /\b(R[\s-]?\d{2,4}\s*[A-Za-z]?)\b/);
  if (refrigerant) addSpec("Refrigerant", refrigerant.replace(/\s+/g, "").toUpperCase());

  const gasType = matchFirst(
    normalizedText,
    /\b(?:TYPE\s+OF\s+GAS|GAS\s+TYPE|GAS)\s*[:#=-]?\s*(NAT(?:URAL)?|LP|PROPANE)\b/i,
  );
  if (gasType) addSpec("Gas type", gasType.toUpperCase().replace(/^NAT$/, "NATURAL"));

  const btu =
    matchFirst(normalizedText, /\b(?:INPUT|BTU(?:\/H[Rr]?)?)\s*[:#=-]?\s*(\d{3,7})\s*BTU(?:\/H[Rr]?)?\b/i) ??
    matchFirst(normalizedText, /\bBTU(?:\/H[Rr]?)?\s*[:#=-]?\s*(\d{3,7})\b/i) ??
    matchFirst(normalizedText, /\b(\d{3,7}\s*BTU(?:\/H[Rr]?)?)\b/i);
  if (btu) addSpec("BTU", normalizeBtuValue(btu));

  const manifoldPressure = matchFirst(
    normalizedText,
    /\b(?:MANIFOLD\s+)?PRESSURE\s*[:#=-]?\s*([0-9.]+\s*(?:IN(?:CH(?:ES)?)?\.?\s*)?(?:W\.?\s*C\.?|WC|WATER\s+COLUMN|PSI|PSIG))\b/i,
  );
  if (manifoldPressure) {
    addSpec(
      /MANIFOLD\s+PRESSURE/i.test(normalizedText) ? "Manifold pressure" : "Pressure",
      manifoldPressure.toUpperCase().replace(/\s+/g, " "),
    );
  }

  const tonnage = matchFirst(normalizedText, /\b(\d{1,3}(?:\.\d)?\s*TON)\b/i);
  if (tonnage) addSpec("Capacity", tonnage.replace(/\s+/g, "").toUpperCase());

  const horsepower = matchFirst(
    normalizedText,
    /\b(?:HORSEPOWER|H\.?\s*P\.?|HP)\s*[:#=-]?\s*(\d+\/\d+|\d+(?:\.\d+)?)\s*(?:HP)?\b/i,
  );
  if (horsepower) addSpec("Horsepower", horsepower.toUpperCase());

  const refrigerantCharge = matchFirst(
    normalizedText,
    /\b(?:REFRIG(?:ERANT)?\s*)?(?:CHARGE|CHG)\s*[:#=-]?\s*([0-9.]+\s*(?:LB|LBS|OZ|KG|G)(?:\s+[0-9.]+\s*(?:OZ|G))?)\b/i,
  );
  if (refrigerantCharge) addSpec("Refrigerant charge", refrigerantCharge.toUpperCase());

  const manufactured = matchFirst(
    normalizedText,
    /\b(?:MFG|MFD|MANUFACTURED|DATE\s+OF\s+MFG|MFG\s+DATE)\s*(?:DATE)?\s*[:#=-]?\s*((?:\d{1,2}[/-])?\d{1,2}[/-]\d{2,4}|\d{4}[-/]\d{1,2}(?:[-/]\d{1,2})?|[A-Z]{3,9}\s+\d{4})\b/i,
  );
  if (manufactured) addSpec("Manufactured", manufactured);

  return cleanNameplateResult({
    name,
    manufacturer,
    model,
    serial,
    specs,
  });
}

function matchFirst(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  return match ? match[1] : null;
}

function matchLabeledValue(lines: string[], labelPattern: RegExp): string | null {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!labelPattern.test(line)) continue;

    const inline = line
      .replace(labelPattern, "")
      .replace(/^[\s:;#=\-–—.]*/, "")
      .trim();
    if (looksLikeFieldValue(inline)) return inline;

    const next = lines[i + 1]?.trim();
    if (next && looksLikeFieldValue(next) && !/^(MODEL|SERIAL|MFR|MFG|MAKE|BRAND)\b/i.test(next)) {
      return next;
    }
  }
  return null;
}

function normalizeOcrText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/[|]/g, "I")
    .replace(/\bM[O0]DEL\b/gi, "MODEL")
    .replace(/\bM[O0]D\b/gi, "MOD")
    .replace(/\bSER[I1]AL\b/gi, "SERIAL")
    .replace(/\bS\s*[/I1]\s*N\b/gi, "S/N")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[•·]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .trim();
}

function looksLikeFieldValue(value: string): boolean {
  const cleaned = cleanValue(value);
  if (!cleaned || cleaned.length < 2) return false;
  if (/^(NO|NUMBER|MODEL|SERIAL|MFR|MANUFACTURER|BRAND)$/i.test(cleaned)) return false;
  return /[A-Z0-9]/i.test(cleaned);
}

function cleanValue(value: string | null | undefined): string | null {
  const cleaned = (value ?? "")
    .replace(/\s+/g, " ")
    .replace(/^[\s:;#=\-–—.]+/, "")
    .replace(/[\s,;]+$/, "")
    .trim();
  if (!cleaned) return null;
  return cleaned.length > 80 ? cleaned.slice(0, 80).trim() : cleaned;
}

function cleanIdentifierValue(value: string | null | undefined): string | null {
  const cleaned = cleanValue(value);
  if (!cleaned) return null;
  return cleanValue(
    cleaned.replace(
      /\s+(?:MODEL|MOD|MDL|M\/N|MN|SERIAL|SER\.?\s*NO|S\/N|SN|MFR|MFG|MANUFACTURER|MAKE|BRAND|VOLTS?|VOLTAGE|PHASE|HZ|REFRIG(?:ERANT)?|RLA|FLA|MCA|MOCP|AMPS?)\b.*$/i,
      "",
    ),
  );
}

function normalizeAmpValue(value: string): string {
  const normalized = value.replace(/\s+/g, "").toUpperCase().replace(/AMPS?$/, "A");
  return /A$/.test(normalized) ? normalized : `${normalized}A`;
}

function normalizeBtuValue(value: string): string {
  const normalized = value.replace(/\s+/g, "").toUpperCase();
  return /BTU/.test(normalized) ? normalized : `${normalized}BTU/HR`;
}

function valueEqualsSpec(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false;
  return normalizeAmpValue(left) === normalizeAmpValue(right);
}

function looksLikeRefrigerantSlice(text: string, value: string): boolean {
  const digits = value.match(/\d{2,4}/)?.[0];
  if (!digits) return false;
  return new RegExp(`\\bR[\\s-]?${escapeRegExp(digits)}\\s*A?\\b`, "i").test(text);
}

function cleanManufacturer(value: string | null | undefined): string | null {
  const cleaned = cleanValue(value);
  if (!cleaned) return null;
  return (
    KNOWN_MANUFACTURERS.find((brand) => brand.toLowerCase() === cleaned.toLowerCase()) ??
    cleaned
  );
}

function looksLikeManufacturerValue(value: string | null | undefined): boolean {
  const cleaned = cleanValue(value);
  if (!cleaned) return false;
  if (/^(DATE|MFG\s+DATE|MFD\s+DATE|SERIAL|MODEL|NO|NUMBER)\b/i.test(cleaned)) {
    return false;
  }
  return true;
}

function cleanNameplateResult(result: NameplateResult): NameplateResult {
  const specs: NameplateSpec[] = [];
  const seen = new Set<string>();
  for (const spec of result.specs) {
    const label = cleanValue(spec.label);
    const value = cleanValue(spec.value);
    if (!label || !value) continue;
    const key = `${label}:${value}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    specs.push({ label, value });
  }

  return {
    name: cleanValue(result.name),
    manufacturer: cleanManufacturer(result.manufacturer),
    model: cleanValue(result.model),
    serial: cleanValue(result.serial),
    specs: specs.slice(0, 12),
  };
}

function hasAnyNameplateData(result: NameplateResult): boolean {
  return Boolean(
    result.name ||
      result.manufacturer ||
      result.model ||
      result.serial ||
      result.specs.length > 0,
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function brandPattern(brand: string): string {
  return escapeRegExp(brand).replace(/[\s-]+/g, "[\\s-]?");
}

function extractElectricalTriplet(text: string): {
  voltage: string;
  phase: string;
  hertz: string;
} | null {
  const voltageHertzPhaseLabel = text.match(
    /\b(?:V(?:OLTS?)?|VOLTAGE)\s*[/, ]+\s*(?:HZ|HERTZ)\s*[/, ]+\s*(?:PH|PHASE)\s*[:#=-]?\s*(\d{2,3}(?:[-/]\d{2,3})?)\s*[/, ]+\s*(\d{2,3})\s*[/, ]+\s*([13])\b/i,
  );
  if (voltageHertzPhaseLabel) {
    return {
      voltage: voltageHertzPhaseLabel[1],
      phase: voltageHertzPhaseLabel[3],
      hertz: voltageHertzPhaseLabel[2],
    };
  }

  const labelOrder = text.match(
    /\b(?:V(?:OLTS?)?|VOLTAGE)\s*[/, ]+\s*(?:PH|PHASE)\s*[/, ]+\s*(?:HZ|HERTZ)\s*[:#=-]?\s*(\d{2,3}(?:[-/]\d{2,3})?)\s*[/, ]+\s*([13])\s*[/, ]+\s*(\d{2,3})\b/i,
  );
  if (labelOrder) {
    return { voltage: labelOrder[1], phase: labelOrder[2], hertz: labelOrder[3] };
  }

  const hzBeforePhase = text.match(
    /\b(?:V(?:OLTS?)?|VOLTAGE|ELECTRICAL|ELEC)\s*[:#=-]?\s*(\d{2,3}(?:[-/]\d{2,3})?)\s*[/,]\s*(\d{2,3})\s*[/,]\s*([13])\b/i,
  );
  if (hzBeforePhase) {
    return { voltage: hzBeforePhase[1], phase: hzBeforePhase[3], hertz: hzBeforePhase[2] };
  }

  const phaseBeforeHz = text.match(
    /\b(?:V(?:OLTS?)?|VOLTAGE|ELECTRICAL|ELEC)\s*[:#=-]?\s*(\d{2,3}(?:[-/]\d{2,3})?)\s*[/,]\s*([13])\s*[/,]\s*(\d{2,3})\b/i,
  );
  if (phaseBeforeHz) {
    return { voltage: phaseBeforeHz[1], phase: phaseBeforeHz[2], hertz: phaseBeforeHz[3] };
  }

  return null;
}
