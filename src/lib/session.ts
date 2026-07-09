import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export const SESSION_COOKIE = "tat_session";
// Kept short on purpose — this can sit on a shared kitchen device, so it
// re-locks itself well within a shift rather than staying open for hours.
const SESSION_HOURS = 1;

// The HMAC key is derived from the PIN itself: changing the PIN
// invalidates every existing session with no extra bookkeeping.
function sign(expires: string, pin: string): string {
  return createHmac("sha256", `tat-session:${pin}`).update(expires).digest("hex");
}

export async function getDashboardPin(): Promise<string | null> {
  const setting = await prisma.setting.findUnique({
    where: { key: "dashboardPin" },
  });
  return setting?.value ?? null;
}

export function makeSessionValue(pin: string): { value: string; maxAge: number } {
  const expires = String(Date.now() + SESSION_HOURS * 3_600_000);
  return {
    value: `${expires}.${sign(expires, pin)}`,
    maxAge: SESSION_HOURS * 3600,
  };
}

export async function setSessionCookie(pin: string) {
  const { value, maxAge } = makeSessionValue(pin);
  (await cookies()).set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

export async function hasDashboardSession(): Promise<boolean> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return false;
  const dot = raw.indexOf(".");
  if (dot === -1) return false;
  const expires = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  const pin = await getDashboardPin();
  if (!pin) return false;
  const expected = sign(expires, pin);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
