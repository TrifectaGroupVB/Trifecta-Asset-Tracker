"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { getDashboardPin, hasDashboardSession, setSessionCookie } from "@/lib/session";
import {
  FEATURE_KEYS,
  NOTIFICATION_KEYS,
  setFeatureFlag,
  setNotificationFlag,
  type FeatureKey,
  type NotificationKey,
} from "@/lib/settings";
import { saveUpload } from "@/lib/uploads";

async function assertSession() {
  if (!(await hasDashboardSession())) redirect("/dashboard");
}

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

// ---- Feature switches ----

// One form per switch, submitted by the toggle itself. The desired state
// rides along as a hidden field rather than being read from the checkbox,
// so this works identically with JavaScript off.
export async function toggleFeature(formData: FormData) {
  await assertSession();
  const key = str(formData, "key") as FeatureKey;
  if (!(FEATURE_KEYS as readonly string[]).includes(key)) return;
  await setFeatureFlag(key, str(formData, "next") === "on");
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/admin");
}

export async function toggleNotification(formData: FormData) {
  await assertSession();
  const key = str(formData, "key") as NotificationKey;
  if (!(NOTIFICATION_KEYS as readonly string[]).includes(key)) return;
  await setNotificationFlag(key, str(formData, "next") === "on");
  revalidatePath("/dashboard/settings");
}

// ---- Email ----

export async function updateAdminEmail(formData: FormData) {
  await assertSession();
  const email = str(formData, "adminEmail");
  if (!email || !email.includes("@")) redirect("/dashboard/settings?error=bad-email");
  await prisma.setting.upsert({
    where: { key: "adminEmail" },
    update: { value: email },
    create: { key: "adminEmail", value: email },
  });
  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings?ok=email-saved");
}

// Proves the whole chain end to end: the key is set, the from-address is
// accepted, and the admin address actually receives mail. Without a key,
// sendEmail logs instead of sending and this reports that honestly rather
// than claiming success.
export async function sendTestEmail() {
  await assertSession();
  const row = await prisma.setting.findUnique({ where: { key: "adminEmail" } });
  const to = row?.value;
  if (!to) redirect("/dashboard/settings?error=no-email");
  if (!process.env.RESEND_API_KEY)
    redirect("/dashboard/settings?error=no-resend");

  await sendEmail({
    to,
    subject: "Trifecta Asset Tracker — test email",
    text:
      "This is a test from the Trifecta Asset Tracker settings page.\n\n" +
      "If you're reading this, assignment notices and part-order requests " +
      "will reach this address too.",
  });
  redirect("/dashboard/settings?ok=test-sent");
}

// ---- PIN ----

export async function changePin(formData: FormData) {
  await assertSession();
  const currentPin = str(formData, "currentPin");
  const newPin = str(formData, "newPin");
  const real = await getDashboardPin();
  if (!real || currentPin !== real) {
    redirect("/dashboard/settings?error=wrong-pin");
  }
  if (!/^\d{6}$/.test(newPin)) {
    redirect("/dashboard/settings?error=bad-pin");
  }
  await prisma.setting.upsert({
    where: { key: "dashboardPin" },
    update: { value: newPin },
    create: { key: "dashboardPin", value: newPin },
  });
  // Sessions are signed with the PIN — re-issue so this device stays unlocked
  await setSessionCookie(newPin);
  redirect("/dashboard/settings?ok=pin-changed");
}

// ---- Locations ----

export async function updateLocation(formData: FormData) {
  await assertSession();
  const id = str(formData, "id");
  const name = str(formData, "name");
  const address = str(formData, "address");
  if (!id || !name || !address) return;
  await prisma.location.update({ where: { id }, data: { name, address } });
  revalidatePath("/dashboard/settings");
  revalidatePath("/");
}

// Upload a custom logo for this location's printed QR tags. Saved to
// `printLogoUrl`, which both the on-screen print sheet and the PNG export use
// (they resolve `printLogoUrl ?? logoUrl`). The logo is desaturated to
// grayscale at print time, so any color logo prints in black & white.
export async function uploadLocationPrintLogo(formData: FormData) {
  await assertSession();
  const id = str(formData, "id");
  const file = formData.get("logo");
  if (!id || !(file instanceof File)) return;
  const saved = await saveUpload(file, "brand", "image");
  if (!saved.ok) {
    redirect("/dashboard/settings?error=logo-upload");
  }
  await prisma.location.update({ where: { id }, data: { printLogoUrl: saved.url } });
  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings?ok=logo-saved");
}

// Clear a location's custom print logo, falling back to its default logo.
export async function resetLocationPrintLogo(formData: FormData) {
  await assertSession();
  const id = str(formData, "id");
  if (!id) return;
  await prisma.location.update({ where: { id }, data: { printLogoUrl: null } });
  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings?ok=logo-reset");
}
