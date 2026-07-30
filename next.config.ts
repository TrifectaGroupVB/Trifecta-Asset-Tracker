import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Vercel Blob — equipment/request/part photos in production
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
  // These ship native/wasm assets that break when Next traces them into the
  // bundle — they have to be required at runtime from node_modules instead.
  // Server Actions cap request bodies at 1 MB by default, which a camera photo
  // clears instantly. Photos are shrunk in the browser before they're sent, so
  // this is only a backstop for a browser where that can't run — kept under
  // Vercel's own ~4.5 MB request cap, since anything above that is refused
  // before Next.js sees it regardless of what's configured here.
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  serverExternalPackages: [
    "@prisma/adapter-pg",
    "pg",
    "sharp",
    "heic-convert",
    "@anthropic-ai/sdk",
  ],
};

export default nextConfig;
