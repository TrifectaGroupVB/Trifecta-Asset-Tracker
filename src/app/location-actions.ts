"use server";

import { revalidatePath } from "next/cache";
import { setLocationCookie } from "@/lib/location";

export async function selectLocation(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  if (!slug) return;
  await setLocationCookie(slug);
  revalidatePath("/");
  revalidatePath("/equipment");
  revalidatePath("/request");
}
