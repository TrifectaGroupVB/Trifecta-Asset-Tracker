import { randomBytes } from "node:crypto";

// No ambiguous characters (0/O, 1/I/L) — codes get printed on physical
// stickers and typed by hand as the greasy-QR fallback.
const TAG_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const TAG_CODE_LENGTH = 8;

export function generateTagCode(taken: Set<string> = new Set()): string {
  for (;;) {
    const bytes = randomBytes(TAG_CODE_LENGTH);
    let code = "";
    for (const b of bytes) code += TAG_ALPHABET[b % TAG_ALPHABET.length];
    if (!taken.has(code)) {
      taken.add(code);
      return code;
    }
  }
}
