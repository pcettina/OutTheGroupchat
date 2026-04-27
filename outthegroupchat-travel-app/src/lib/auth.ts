/**
 * @module auth
 * @description NextAuth.js configuration for the application, including Google OAuth and
 * credentials-based authentication providers, JWT session strategy, and Prisma adapter.
 */
import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

/**
 * Default landing surface for newly-signed-in users in v1.
 * /trips and /dashboard were removed during the meetup pivot, so any signIn()
 * that does not specify a callbackUrl must land here instead.
 */
export const POST_SIGNIN_DEFAULT_PATH = '/heatmap';

/**
 * Routes that existed pre-pivot but have been removed. If a stale link or
 * client cache hands these to NextAuth as a callbackUrl, fall back to the v1
 * default rather than 404'ing the user.
 */
const REMOVED_LEGACY_PATHS = new Set<string>([
  '/trips',
  '/dashboard',
]);

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
 * @description NextAuth.js options object configuring the Prisma adapter, JWT session strategy,
 * custom sign-in/error pages, Google and credentials providers, and session/JWT callbacks
 * that populate the session with the user's database ID.
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
    async redirect({ url, baseUrl }) {
      // Bare baseUrl with no destination → land on the v1 default surface.
      // Pre-pivot this fell through to "/" which then loaded the marketing
      // home, but real users reported a brief 404 flash because callers were
      // still hard-coding "/trips". Centralize the fallback here.
      if (url === baseUrl || url === `${baseUrl}/`) {
        return `${baseUrl}${POST_SIGNIN_DEFAULT_PATH}`;
      }

      // Same-origin relative path (e.g. "/intents", "/heatmap?city=nyc").
      // Reject protocol-relative URLs ("//evil.example.com") — these start
      // with "/" but would resolve to a third-party origin.
      if (url.startsWith('/') && !url.startsWith('//')) {
        const path = url.split('?')[0];
        if (REMOVED_LEGACY_PATHS.has(path)) {
          return `${baseUrl}${POST_SIGNIN_DEFAULT_PATH}`;
        }
        return `${baseUrl}${url}`;
      }

      // Same-origin absolute URL.
      try {
        const parsed = new URL(url);
        if (parsed.origin === baseUrl) {
          if (REMOVED_LEGACY_PATHS.has(parsed.pathname)) {
            return `${baseUrl}${POST_SIGNIN_DEFAULT_PATH}`;
          }
          return url;
        }
      } catch {
        // Fall through to default
      }

      // Cross-origin, protocol-relative, or malformed → never honor
      // (open-redirect guard).
      return `${baseUrl}${POST_SIGNIN_DEFAULT_PATH}`;
    },
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