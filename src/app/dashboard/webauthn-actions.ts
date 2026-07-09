"use server";

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getDashboardPin, hasDashboardSession, setSessionCookie } from "@/lib/session";
import { getRpConfig } from "@/lib/webauthn";

// Transient, single-use nonce for one registration/authentication ceremony.
// Tampering with this cookie can only break the ceremony, not forge a
// signature, so a plain httpOnly cookie (no extra signing) is enough.
const CHALLENGE_COOKIE = "tat_webauthn_challenge";
const CHALLENGE_MAX_AGE = 120;

async function setChallenge(challenge: string) {
  (await cookies()).set(CHALLENGE_COOKIE, challenge, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CHALLENGE_MAX_AGE,
  });
}

async function takeChallenge(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(CHALLENGE_COOKIE)?.value ?? null;
  store.delete(CHALLENGE_COOKIE);
  return value;
}

async function assertSession() {
  if (!(await hasDashboardSession())) redirect("/dashboard");
}

// ---- Enrollment (requires an existing PIN-authenticated session) ----

export async function getRegistrationOptions() {
  await assertSession();
  const { rpID, rpName } = getRpConfig();

  const existing = await prisma.webAuthnCredential.findMany({
    select: { credentialId: true },
  });

  const options = await generateRegistrationOptions({
    rpID,
    rpName,
    userName: "trifecta-dashboard", // single shared PIN, not a per-person account
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.credentialId })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
      authenticatorAttachment: "platform", // Face ID / Touch ID / device fingerprint, not a USB key
    },
  });

  await setChallenge(options.challenge);
  return options;
}

export type VerifyRegistrationResult =
  | { ok: true }
  | { ok: false; error: string };

export async function verifyRegistration(
  response: RegistrationResponseJSON,
  deviceLabel: string
): Promise<VerifyRegistrationResult> {
  await assertSession();
  const { rpID, origin } = getRpConfig();
  const expectedChallenge = await takeChallenge();
  if (!expectedChallenge) return { ok: false, error: "That took too long — try again." };

  const label = deviceLabel.trim() || "Unnamed device";

  try {
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
    if (!verification.verified || !verification.registrationInfo) {
      return { ok: false, error: "Couldn't verify that — try again." };
    }
    const { credential } = verification.registrationInfo;
    await prisma.webAuthnCredential.create({
      data: {
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        deviceLabel: label,
      },
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "Setup was cancelled or failed." };
  }
}

export async function deleteCredential(formData: FormData) {
  await assertSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.webAuthnCredential.delete({ where: { id } });
}

// ---- Unlock (no session yet — this IS the unlock mechanism) ----

export async function hasAnyCredentials(): Promise<boolean> {
  const count = await prisma.webAuthnCredential.count();
  return count > 0;
}

export async function getAuthenticationOptions() {
  const { rpID } = getRpConfig();
  const credentials = await prisma.webAuthnCredential.findMany({
    select: { credentialId: true },
  });

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    allowCredentials: credentials.map((c) => ({ id: c.credentialId })),
  });

  await setChallenge(options.challenge);
  return options;
}

export type VerifyAuthenticationResult =
  | { ok: true }
  | { ok: false; error: string };

export async function verifyAuthentication(
  response: AuthenticationResponseJSON
): Promise<VerifyAuthenticationResult> {
  const { rpID, origin } = getRpConfig();
  const expectedChallenge = await takeChallenge();
  if (!expectedChallenge) return { ok: false, error: "That took too long — try again." };

  const stored = await prisma.webAuthnCredential.findUnique({
    where: { credentialId: response.id },
  });
  if (!stored) return { ok: false, error: "This device isn't enrolled." };

  try {
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: stored.credentialId,
        publicKey: new Uint8Array(stored.publicKey),
        counter: stored.counter,
      },
    });
    if (!verification.verified) return { ok: false, error: "Couldn't verify that." };

    await prisma.webAuthnCredential.update({
      where: { id: stored.id },
      data: { counter: verification.authenticationInfo.newCounter },
    });

    const pin = await getDashboardPin();
    if (!pin) return { ok: false, error: "Dashboard isn't set up yet." };
    await setSessionCookie(pin);
    return { ok: true };
  } catch {
    return { ok: false, error: "Unlock was cancelled or failed." };
  }
}
