import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// List of allowed origins for CORS/CSRF validation
const getAllowedOrigins = (): string[] => {
  const origins: string[] = [];
  
  // Add production URL if set
  if (process.env.NEXTAUTH_URL) {
    origins.push(new URL(process.env.NEXTAUTH_URL).origin);
  }
  
  // Add localhost variants for development
  if (process.env.NODE_ENV === 'development') {
    origins.push('http://localhost:3000');
    origins.push('http://127.0.0.1:3000');
  }
  
  return origins;
};

/**
 * Validate CSRF by checking Origin/Referer header against allowed hosts
 * This prevents cross-site request forgery attacks
 */
function validateCsrf(req: NextRequest): boolean {
  const method = req.method;
  
  // Only validate state-changing requests
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return true;
  }
  
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const host = req.headers.get('host');
  
  // If no origin header (same-origin requests or non-browser clients)
  if (!origin) {
    // Check referer as fallback
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        return refererUrl.host === host;
      } catch {
        return false;
      }
    }
    // Allow requests without origin/referer (API clients, curl, etc.)
    // These are still protected by authentication
    return true;
  }
  
  // Validate origin matches host
  try {
    const originUrl = new URL(origin);
    const allowedOrigins = getAllowedOrigins();
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      return true;
    }
    
    // Check if origin host matches request host
    return originUrl.host === host;
  } catch {
    return false;
  }
}

export default withAuth(
  function middleware(req) {
    // CSRF protection for state-changing API requests
    if (req.nextUrl.pathname.startsWith('/api/')) {
      if (!validateCsrf(req)) {
        return NextResponse.json(
          { success: false, error: 'CSRF validation failed' },
          { status: 403 }
        );
      }
    }
    
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: '/auth/signin',
    },
  }
);

export const config = {
  matcher: [
    '/trips/:path*',
    '/profile/:path*',
    '/api/trips/:path*',
    '/api/profile/:path*',
    '/api/ai/:path*',
    '/api/notifications/:path*',
    '/api/invitations/:path*',
  ],
}; 