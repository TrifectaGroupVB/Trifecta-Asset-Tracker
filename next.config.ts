import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Vercel Blob — equipment/request/part photos in production
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
  // These ship native/wasm/worker assets that break when Next traces them into
  // the bundle — they have to be required at runtime from node_modules instead.
  serverExternalPackages: [
    "@prisma/adapter-pg",
    "pg",
    "tesseract.js",
    "@anthropic-ai/sdk",
  ],
};

export default nextConfig;
