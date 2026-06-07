'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Loader2 } from 'lucide-react';

const POST_SIGNIN_DEFAULT_PATH = '/heatmap';

interface PendingInvitation {
  id: string;
  tripId: string;
  status: string;
}

function resolveCallback(raw: string | null): string {
  if (!raw) return POST_SIGNIN_DEFAULT_PATH;
  // Only honor same-origin relative paths to avoid open redirects.
  if (!raw.startsWith('/') || raw.startsWith('//')) return POST_SIGNIN_DEFAULT_PATH;
  const path = raw.split('?')[0];
  if (path === '/trips' || path === '/dashboard') return POST_SIGNIN_DEFAULT_PATH;
  return raw;
}

function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const callbackParam = searchParams.get('callbackUrl') ?? searchParams.get('redirect');
  const redirectTo = resolveCallback(callbackParam);
  const isInvitation = searchParams.get('invitation') === 'true';

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          email,
          password,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create account');
      }

      // Auto sign-in after successful registration
      const signInResult = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (signInResult?.error) {
        const signInUrl = callbackParam
          ? `/auth/signin?registered=true&callbackUrl=${encodeURIComponent(callbackParam)}`
          : '/auth/signin?registered=true';
        router.push(signInUrl);
        return;
      }

      // If coming from invitation link, try to auto-accept pending invitations
      if (isInvitation && callbackParam) {
        try {
          // Extract tripId from redirect URL (legacy format: /trips/[tripId])
          const tripIdMatch = callbackParam.match(/\/trips\/([^/?]+)/);
          if (tripIdMatch) {
            const tripId = tripIdMatch[1];

            const invitationsResponse = await fetch('/api/invitations');
            if (invitationsResponse.ok) {
              const invitationsData = await invitationsResponse.json();
              const pendingInvitation = invitationsData.data?.find(
                (inv: PendingInvitation) => inv.tripId === tripId && inv.status === 'PENDING'
              );

              if (pendingInvitation) {
                const acceptResponse = await fetch(`/api/invitations/${pendingInvitation.id}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'accept' }),
                });

                if (acceptResponse.ok) {
                  router.push(callbackParam);
                  router.refresh();
                  return;
                }
              }
            }
          }
        } catch {
          // Continue with normal redirect even if auto-accept fails
        }
      }

      router.push(redirectTo);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to create account');
    } finally {
      setIsLoading(false);
    }
  };

  const signInHref = callbackParam
    ? `/auth/signin?callbackUrl=${encodeURIComponent(callbackParam)}`
    : '/auth/signin';

  return (
    <div className="w-full max-w-md">
      {/* Brand mark */}
      <Link href="/" className="flex items-center justify-center gap-2.5 mb-8 group">
        <Image
          src="/logo-mark.svg"
          alt=""
          aria-hidden="true"
          width={26}
          height={40}
          priority
          className="h-9 w-auto transition-transform group-hover:-translate-y-0.5"
        />
        <span className="font-display font-bold text-xl tracking-tight">
          <span className="text-otg-sodium">Out</span>
          <span className="text-otg-text-bright">TheGroupchat</span>
        </span>
      </Link>

      {isInvitation && (
        <div className="mb-6 rounded-xl bg-otg-tile/10 border border-otg-tile/30 p-4">
          <h3 className="text-sm font-semibold text-otg-tile">
            You&apos;re invited to a Crew
          </h3>
          <p className="mt-1 text-sm text-otg-text-dim">
            Make your account to accept the invite and meet up IRL.
          </p>
        </div>
      )}

      <div className="card p-6 sm:p-8">
        <div className="mb-6 text-center">
          <h1 className="font-display font-bold text-3xl sm:text-4xl tracking-tight text-otg-text-bright mb-2">
            <span className="text-gradient">Get in the Groupchat.</span>
          </h1>
          <p className="text-sm text-otg-text-dim">
            Get off your phone. See your Crew IRL.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-otg-danger/40 bg-otg-danger/10 p-3.5"
          >
            <p className="text-sm text-otg-danger">{error}</p>
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-otg-text-bright mb-1.5">
              Full name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              placeholder="Alex Rivera"
              className="input"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-otg-text-bright mb-1.5">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              className="input"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-otg-text-bright mb-1.5">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              placeholder="At least 6 characters"
              className="input"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-otg-text-bright mb-1.5">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              placeholder="Type it again"
              className="input"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary w-full mt-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" aria-hidden="true" />
                Making your account
              </>
            ) : (
              <>
                Make my account
                <ArrowRight className="w-5 h-5 ml-2" aria-hidden="true" />
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-otg-text-dim">
          Already have one?{' '}
          <Link
            href={signInHref}
            className="font-medium text-otg-sodium hover:text-otg-sodium-300 transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>

      <p className="mt-6 text-center text-xs text-otg-text-dim">
        By making an account you agree to the{' '}
        <Link href="/terms" className="hover:text-otg-text-bright transition-colors underline-offset-2 hover:underline">
          terms
        </Link>{' '}
        and{' '}
        <Link href="/privacy" className="hover:text-otg-text-bright transition-colors underline-offset-2 hover:underline">
          privacy notice
        </Link>
        .
      </p>
    </div>
  );
}

function SignUpLoading() {
  return (
    <div className="w-full max-w-md">
      <div className="flex items-center justify-center gap-2.5 mb-8">
        <div className="h-9 w-6 skeleton" />
        <div className="h-6 w-44 skeleton" />
      </div>
      <div className="card p-6 sm:p-8 space-y-4">
        <div className="h-9 skeleton w-3/4 mx-auto" />
        <div className="h-4 skeleton w-1/2 mx-auto" />
        <div className="h-12 skeleton" />
        <div className="h-12 skeleton" />
        <div className="h-12 skeleton" />
        <div className="h-12 skeleton" />
        <div className="h-12 skeleton" />
      </div>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-otg-bg-dark text-otg-text-bright px-4 sm:px-6 lg:px-8 py-12 relative overflow-hidden">
      {/* Sodium-lamp halos — match the marketing surface */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[28rem] h-[28rem] bg-otg-sodium/15 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-otg-bourbon/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 right-1/3 w-72 h-72 bg-otg-tile/10 rounded-full blur-3xl" />
      </div>
      <Suspense fallback={<SignUpLoading />}>
        <SignUpForm />
      </Suspense>
    </div>
  );
}
