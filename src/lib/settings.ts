// Backend controls that live in the `Setting` key/value table rather than in
// env vars, so they can be flipped from /dashboard/settings without a deploy.
//
// Two families live here:
//   - FEATURES: on/off switches for the AI-assisted extras. Default ON, so a
//     fresh database behaves like the feature shipped; a row only ever exists
//     once someone has deliberately toggled something.
//   - NOTIFICATIONS: which events actually send email. Same default-ON rule.
//
// Reads are cheap (one `findMany` for the whole family) and always hit the DB
// — these are read per-request on pages that are already dynamic, and a stale
// cached flag would be worse than the query.

import { prisma } from "@/lib/db";

export const FEATURE_KEYS = ["nameplateScan", "partsImport"] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_LABELS: Record<FeatureKey, { title: string; blurb: string }> = {
  nameplateScan: {
    title: "Nameplate scan",
    blurb:
      "Adds a “Scan the data plate” button to the tag setup wizard — snap the plate and the new-unit form fills itself in.",
  },
  partsImport: {
    title: "Parts from manual",
    blurb:
      "Adds a “Pull parts from manual” tool to the Parts section of the equipment editor — reads a manual PDF and proposes parts to add.",
  },
};

export const NOTIFICATION_KEYS = ["assignment", "partOrder", "urgentRequest"] as const;
export type NotificationKey = (typeof NOTIFICATION_KEYS)[number];

export const NOTIFICATION_LABELS: Record<
  NotificationKey,
  { title: string; blurb: string }
> = {
  assignment: {
    title: "Request assigned to a tech",
    blurb: "Emails the tech when a service request is assigned to them.",
  },
  partOrder: {
    title: "Part order requested",
    blurb: "Emails the admin address when someone submits a part order (PO-####).",
  },
  urgentRequest: {
    title: "New URGENT request",
    blurb:
      "Emails the admin address the moment an urgent service request comes in, instead of waiting for someone to check the queue.",
  },
};

function settingKey(prefix: string, key: string): string {
  return `${prefix}:${key}`;
}

// A missing row means "on" — see the note at the top of this file.
function isOn(value: string | undefined): boolean {
  return value !== "off";
}

async function readFlags<K extends string>(
  prefix: string,
  keys: readonly K[]
): Promise<Record<K, boolean>> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: keys.map((k) => settingKey(prefix, k)) } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(
    keys.map((k) => [k, isOn(byKey.get(settingKey(prefix, k)))])
  ) as Record<K, boolean>;
}

async function writeFlag(prefix: string, key: string, on: boolean) {
  const fullKey = settingKey(prefix, key);
  await prisma.setting.upsert({
    where: { key: fullKey },
    update: { value: on ? "on" : "off" },
    create: { key: fullKey, value: on ? "on" : "off" },
  });
}

export function getFeatureFlags(): Promise<Record<FeatureKey, boolean>> {
  return readFlags("feature", FEATURE_KEYS);
}

export async function isFeatureEnabled(key: FeatureKey): Promise<boolean> {
  const row = await prisma.setting.findUnique({
    where: { key: settingKey("feature", key) },
  });
  return isOn(row?.value);
}

export function setFeatureFlag(key: FeatureKey, on: boolean): Promise<void> {
  return writeFlag("feature", key, on);
}

export function getNotificationFlags(): Promise<Record<NotificationKey, boolean>> {
  return readFlags("notify", NOTIFICATION_KEYS);
}

export async function isNotificationEnabled(key: NotificationKey): Promise<boolean> {
  const row = await prisma.setting.findUnique({
    where: { key: settingKey("notify", key) },
  });
  return isOn(row?.value);
}

export function setNotificationFlag(key: NotificationKey, on: boolean): Promise<void> {
  return writeFlag("notify", key, on);
}

export async function getAdminEmail(): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: "adminEmail" } });
  return row?.value ?? null;
}

// Which optional integrations are actually wired up in the environment. Only
// ever reports whether a key is *present* — never the value itself.
export function getEnvStatus() {
  return {
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    resend: Boolean(process.env.RESEND_API_KEY),
    blob: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    baseUrl: process.env.BASE_URL ?? null,
  };
}
