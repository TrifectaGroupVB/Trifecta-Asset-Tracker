import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import type { Location } from "@/generated/prisma/client";

// Preference only, not a security boundary — long-lived so the toggle
// "sticks" across visits on the same device.
export const LOCATION_COOKIE = "tat_location";
const LOCATION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export async function getLocations(): Promise<Location[]> {
  return prisma.location.findMany({ orderBy: { name: "asc" } });
}

// Resolves which location's equipment/request form a public visitor should
// see. `overrideSlug` (e.g. a `?location=` param from a QR-scanned station
// tag) wins over the cookie — a scanned tag always shows its own location's
// equipment regardless of what the visitor last toggled on the home screen.
export async function resolveLocation(
  overrideSlug?: string
): Promise<{ location: Location | null; locations: Location[] }> {
  const locations = await getLocations();
  if (overrideSlug) {
    const found = locations.find((l) => l.slug === overrideSlug);
    if (found) return { location: found, locations };
  }
  const cookieSlug = (await cookies()).get(LOCATION_COOKIE)?.value;
  const found = locations.find((l) => l.slug === cookieSlug);
  return { location: found ?? locations[0] ?? null, locations };
}

export async function setLocationCookie(slug: string) {
  (await cookies()).set(LOCATION_COOKIE, slug, {
    path: "/",
    sameSite: "lax",
    maxAge: LOCATION_COOKIE_MAX_AGE,
  });
}
