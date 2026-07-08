import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set — add your Neon Postgres connection string to .env"
    );
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// Lazy singleton: the client (and its DATABASE_URL check) is only created on
// first query, not at import time — `next build` imports page modules without
// a database. Cached on globalThis for dev hot-reload and serverless reuse.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = (globalForPrisma.prisma ??= createClient());
    const value = Reflect.get(client, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
