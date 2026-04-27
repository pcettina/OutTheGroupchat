'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Sparkles, AlertCircle, Loader2 } from 'lucide-react';

interface PendingInvitation {
  id: string;
  tripId: string;
  status: string;
}

function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Get invitation parameters from URL
  const redirectTo = searchParams.get('redirect');
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
        // If auto sign-in fails, redirect to sign-in page with the redirect preserved
        const signInUrl = redirectTo
          ? `/auth/signin?registered=true&redirect=${encodeURIComponent(redirectTo)}`
          : '/auth/signin?registered=true';
        router.push(signInUrl);
        return;
      }

      // If coming from invitation link, try to auto-accept pending invitations
      if (isInvitation && redirectTo) {
        try {
          // Extract tripId from redirect URL (format: /trips/[tripId])
          const tripIdMatch = redirectTo.match(/\/trips\/([^/?]+)/);
          if (tripIdMatch) {
            const tripId = tripIdMatch[1];

            // Fetch user's pending invitations
            const invitationsResponse = await fetch('/api/invitations');
            if (invitationsResponse.ok) {
              const invitationsData = await invitationsResponse.json();
              const pendingInvitation = invitationsData.data?.find(
                (inv: PendingInvitation) => inv.tripId === tripId && inv.status === 'PENDING'
              );

              if (pendingInvitation) {
                // Auto-accept the invitation
                const acceptResponse = await fetch(`/api/invitations/${pendingInvitation.id}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'accept' }),
                });

                if (acceptResponse.ok) {
                  // Successfully accepted, redirect to trip
                  router.push(redirectTo);
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

      // Redirect to the invitation trip or default dashboard
      router.push(redirectTo || '/trips');
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to create account');
    } finally {
      setIsLoading(false);
    }
  };

  // Build sign-in link preserving redirect
  const signInHref = redirectTo
    ? `/auth/signin?redirect=${encodeURIComponent(redirectTo)}`
    : '/auth/signin';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="w-full max-w-md"
    >
      {/* Logo-mark + wordmark */}
      <Link
        href="/"
        className="flex items-center justify-center gap-2.5 mb-8 group"
      >
        <Image
          src="/logo-mark.svg"
          alt=""
          aria-hidden="true"
          width={28}
          height={44}
          priority
          className="h-10 w-auto transition-transform group-hover:-translate-y-0.5"
        />
        <span className="font-display font-bold text-2xl tracking-tight">
          <span className="text-otg-sodium">Out</span>
          <span className="text-otg-text-bright">TheGroupchat</span>
        </span>
      </Link>

      {/* Card */}
      <div className="card card-glass p-7 sm:p-8 relative overflow-hidden">
        <div className="pointer-events-none absolute -top-24 -right-24 w-56 h-56 rounded-full bg-otg-sodium/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 w-56 h-56 rounded-full bg-otg-bourbon/10 blur-3xl" />

        <div className="relative">
          {isInvitation && (
            <div className="bg-green-50 !bg-otg-tile/10 border border-otg-tile/30 rounded-xl p-4 mb-6 flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-otg-tile flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-otg-text-bright">
                  You&apos;ve been invited to a trip!
                </p>
                <p className="mt-1 text-sm text-otg-text-dim">
                  Create an account to accept and start planning together.
                </p>
              </div>
            </div>
          )}

          <div className="mb-6">
            <h2 className="font-display font-bold text-3xl tracking-tight text-otg-text-bright">
              {isInvitation ? 'Join OutTheGroupchat' : 'Create your account'}
            </h2>
            <p className="mt-2 text-sm text-otg-text-dim">
              Already in?{' '}
              <Link
                href={signInHref}
                className="font-medium text-otg-sodium hover:text-otg-sodium-300 transition-colors"
              >
                sign in to your account
              </Link>
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="bg-red-50 !bg-otg-danger/10 border border-otg-danger/30 rounded-xl p-3.5 mb-5 flex items-start gap-2.5"
            >
              <AlertCircle className="w-5 h-5 text-otg-danger flex-shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-sm text-otg-text-bright">{error}</p>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-otg-text-bright mb-1.5"
              >
                Full name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                placeholder="Alex Morgan"
                className="input"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-otg-text-bright mb-1.5"
              >
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
              <label
                htmlFor="password"
                className="block text-sm font-medium text-otg-text-bright mb-1.5"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                placeholder="At least 8 characters"
                className="input"
              />
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-otg-text-bright mb-1.5"
              >
                Confirm password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                placeholder="Repeat your password"
                className="input"
              />
            </div>

            <motion.button
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={isLoading}
              className="btn btn-primary w-full text-base mt-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" aria-hidden="true" />
                  Creating account...
                </>
              ) : (
                'Create account'
              )}
            </motion.button>
          </form>
        </div>
      </div>

      <p className="text-center text-xs text-otg-text-dim mt-6">
        By creating an account, you&apos;re here to actually show up.
      </p>
    </motion.div>
  );
}

function SignUpLoading() {
  return (
    <div className="w-full max-w-md">
      <div className="flex items-center justify-center gap-2.5 mb-8">
        <div className="h-10 w-7 skeleton rounded-md" />
        <div className="h-7 w-48 skeleton rounded-md" />
      </div>
      <div className="card card-glass p-7 sm:p-8 space-y-4">
        <div className="h-8 w-3/4 skeleton rounded-md" />
        <div className="h-4 w-1/2 skeleton rounded-md" />
        <div className="h-12 skeleton rounded-xl" />
        <div className="h-12 skeleton rounded-xl" />
        <div className="h-12 skeleton rounded-xl" />
        <div className="h-12 skeleton rounded-xl" />
        <div className="h-12 skeleton rounded-xl" />
      </div>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <div className="relative min-h-screen flex items-center justify-center bg-otg-bg-dark px-4 py-12 sm:px-6 lg:px-8 overflow-hidden">
      {/* Sodium-lamp ambient halos */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[28rem] h-[28rem] bg-otg-sodium/15 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[24rem] h-[24rem] bg-otg-bourbon/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/3 w-72 h-72 bg-otg-tile/10 rounded-full blur-3xl" />
      </div>

      <Suspense fallback={<SignUpLoading />}>
        <SignUpForm />
      </Suspense>
    </div>
  );
}
