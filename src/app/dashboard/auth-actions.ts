"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDashboardPin, setSessionCookie, SESSION_COOKIE } from "@/lib/session";

export async function verifyPin(pin: string): Promise<{ ok: boolean }> {
  const real = await getDashboardPin();
  if (!real || pin !== real) return { ok: false };
  await setSessionCookie(real);
  return { ok: true };
}

export async function lockDashboard() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/dashboard");
}
