/**
 * @module auth
 * @description NextAuth.js configuration for the OutTheGroupchat application.
 *
 * Provides:
 * - **Prisma adapter** — persists users, sessions, and accounts to PostgreSQL
 *   via the shared {@link prisma} client.
 * - **JWT session strategy** — stateless tokens are used so that sessions work
 *   correctly in Vercel's serverless/edge environment without sticky sessions.
 * - **Google OAuth provider** — users can sign in with their Google account.
 * - **Credentials provider** — email + bcrypt-hashed password sign-in for
 *   users who registered without OAuth.
 * - **Session / JWT callbacks** — propagate the database user ID into every
 *   JWT token and session object so downstream code can call
 *   `session.user.id` without an extra DB round-trip.
 *
 * The module also augments the `next-auth` and `next-auth/jwt` type
 * declarations so TypeScript is aware of the additional `id` field on
 * `Session.user` and `JWT`.
 */
import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
    } & {
      name?: string | null;
      email?: string | null;
      image?: string | null;
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    name: string;
    email: string;
  }
}

/**
 * NextAuth.js configuration object used by the `[...nextauth]` API route and
 * by `getServerSession(authOptions)` in server components and API handlers.
 *
 * Configuration highlights:
 * - Adapter: `@auth/prisma-adapter` — all auth records are stored in the
 *   application's Prisma-managed PostgreSQL database.
 * - Session strategy: `'jwt'` — avoids database session lookups on every
 *   authenticated request.
 * - Custom pages: sign-in at `/auth/signin`, error at `/auth/error`.
 * - Providers:
 *   1. **GoogleProvider** — reads `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
 *      from the environment.
 *   2. **CredentialsProvider** — accepts `email` + `password`, verifies the
 *      bcrypt hash stored on the `User` record, and throws on mismatch.
 * - `session` callback — copies `token.id` and `token.name` onto the
 *   `session.user` object returned to the client.
 * - `jwt` callback — queries the database for the user record on `signIn`
 *   and `update` triggers, then caches `id`, `name`, and `email` in the
 *   token to avoid per-request DB calls.
 *
 * @example
 * ```ts
 * import { getServerSession } from 'next-auth';
 * import { authOptions } from '@/lib/auth';
 *
 * const session = await getServerSession(authOptions);
 * if (!session?.user?.id) {
 *   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 * }
 * ```
 */
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Invalid credentials');
        }

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email,
          },
        });

        if (!user || !user.password) {
          throw new Error('Invalid credentials');
        }

        const isCorrectPassword = await bcrypt.compare(
          credentials.password,
          user.password
        );

        if (!isCorrectPassword) {
          throw new Error('Invalid credentials');
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
  callbacks: {
    async session({ token, session }) {
      if (token) {
        session.user.id = token.id;
        session.user.name = token.name;
      }
      return session;
    },
    async jwt({ token, user, trigger }) {
      // Only query DB on sign-in or explicit update to avoid N+1 queries
      // This optimization prevents database calls on every authenticated request
      if (trigger === "signIn" || trigger === "update") {
        const dbUser = await prisma.user.findFirst({
          where: {
            email: token.email,
          },
        });

        if (dbUser) {
          token.id = dbUser.id;
          token.name = dbUser.name ?? '';
          token.email = dbUser.email;
        } else if (user) {
          token.id = user.id;
        }
      } else if (!token.id && user) {
        // Fallback for initial sign-in if trigger is not set
        token.id = user.id;
      }

      return token;
    },
  },
}; 