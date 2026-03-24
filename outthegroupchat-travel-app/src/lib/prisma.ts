/**
 * @module prisma
 * @description Singleton Prisma client instance for database access. In non-production environments
 * the client is cached on the global object to avoid exhausting database connections during
 * hot-module reloads in development.
 */
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * @description The shared Prisma client instance. Reuses an existing client stored on the
 * global object in development to prevent connection pool exhaustion during hot reloads.
 */
export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma 