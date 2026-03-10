import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock: @/lib/prisma
// Replaces the real PrismaClient singleton with typed vi.fn() stubs so no
// database connection is attempted during tests.
// ---------------------------------------------------------------------------
vi.mock('@/lib/prisma', () => ({
  prisma: {
    trip: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    tripMember: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    tripInvitation: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    pendingInvitation: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
  },
}));

// ---------------------------------------------------------------------------
// Mock: next-auth
// Allows tests to control the session returned by getServerSession().
// ---------------------------------------------------------------------------
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/auth
// authOptions is only passed as an argument to getServerSession; the object
// itself does not need real providers in a unit-test environment.
// ---------------------------------------------------------------------------
vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/logger
// Silence all pino output and expose stubbed helpers so error paths can be
// asserted without console noise.
// ---------------------------------------------------------------------------
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
  logError: vi.fn(),
  logSuccess: vi.fn(),
  apiLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  authLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/invitations
// The trips POST handler calls processInvitations; stub it out so invitation
// logic is not executed in trip creation tests.
// ---------------------------------------------------------------------------
vi.mock('@/lib/invitations', () => ({
  processInvitations: vi.fn().mockResolvedValue({ invitations: [], errors: [] }),
}));
