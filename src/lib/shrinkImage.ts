// Shrink a photo in the browser BEFORE it uploads. iPhone photos are commonly
// 2–8 MB (and sometimes HEIC), which blows past the Server Action body limit
// (1 MB) and Vercel's request cap (~4.5 MB) — the upload is rejected before the
// server ever runs. Resizing to <=1800px and re-encoding as JPEG brings it to a
// few hundred KB and normalises HEIC to a format that renders everywhere. If
// anything goes wrong (a browser that can't decode the source, no canvas, etc.)
// the original file is returned rather than blocking the upload.
//
// Browser-only (uses canvas / Image); import from client components.

const MAX_EDGE = 1800;
const JPEG_QUALITY = 0.82;

export async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode failed"));
      el.src = url;
    });
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = Math.min(1, MAX_EDGE / longest);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY)
    );
    if (!blob) return file;
    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}
