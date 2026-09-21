import { PrismaClient } from "@prisma/client";

/**
 * One Prisma client per process.
 *
 * Next.js hot-reloads modules in development, which would otherwise open a new
 * connection pool on every edit until the database refuses more.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
