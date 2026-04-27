'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { KeyRound, AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';

function AmbientHalos() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute -top-40 -right-40 w-[28rem] h-[28rem] bg-otg-sodium/15 rounded-full blur-3xl" />
      <div className="absolute -bottom-40 -left-40 w-[24rem] h-[24rem] bg-otg-bourbon/10 rounded-full blur-3xl" />
      <div className="absolute top-1/2 left-1/3 w-72 h-72 bg-otg-tile/10 rounded-full blur-3xl" />
    </div>
  );
}

function BrandLockup() {
  return (
    <Link href="/" className="flex items-center justify-center gap-2.5 mb-8 group">
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
  );
}

function ConfirmResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const email = searchParams.get('email') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (!token || !email) {
      setError('Invalid reset link. Please request a new one.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to reset password. Please try again.');
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push('/auth/signin'), 2500);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!token || !email) {
    return (
      <div className="relative min-h-screen flex items-center justify-center bg-otg-bg-dark px-4 py-12 sm:px-6 lg:px-8 overflow-hidden">
        <AmbientHalos />
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full max-w-md relative"
        >
          <BrandLockup />
          <div className="card card-glass p-8 text-center relative overflow-hidden">
            <div className="pointer-events-none absolute -top-24 -right-24 w-56 h-56 rounded-full bg-otg-danger/15 blur-3xl" />
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-otg-danger/15 ring-1 ring-otg-danger/30 flex items-center justify-center mx-auto mb-5">
                <X className="w-8 h-8 text-otg-danger" aria-hidden="true" />
              </div>
              <h1 className="font-display font-bold text-2xl tracking-tight text-otg-text-bright mb-2">
                Invalid reset link
              </h1>
              <p className="text-otg-text-dim mb-7">
                This password reset link is missing required parameters or has expired.
              </p>
              <Link href="/auth/reset-password" className="btn btn-primary text-base px-6">
                Request a new link
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="relative min-h-screen flex items-center justify-center bg-otg-bg-dark px-4 py-12 sm:px-6 lg:px-8 overflow-hidden">
        <AmbientHalos />
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full max-w-md relative"
        >
          <BrandLockup />
          <div className="card card-glass p-8 text-center relative overflow-hidden">
            <div className="pointer-events-none absolute -top-24 -right-24 w-56 h-56 rounded-full bg-otg-tile/15 blur-3xl" />
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-otg-tile/15 ring-1 ring-otg-tile/30 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-8 h-8 text-otg-tile" aria-hidden="true" />
              </div>
              <h1 className="font-display font-bold text-2xl tracking-tight text-otg-text-bright mb-2">
                Password reset
              </h1>
              <p className="text-otg-text-dim mb-2">
                Your password has been updated.
              </p>
              <p className="text-sm text-otg-text-dim flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                Redirecting to sign in...
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-otg-bg-dark px-4 py-12 sm:px-6 lg:px-8 overflow-hidden">
      <AmbientHalos />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-md relative"
      >
        <BrandLockup />
        <div className="card card-glass p-7 sm:p-8 relative overflow-hidden">
          <div className="pointer-events-none absolute -top-24 -right-24 w-56 h-56 rounded-full bg-otg-sodium/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 -left-20 w-56 h-56 rounded-full bg-otg-bourbon/10 blur-3xl" />

          <div className="relative">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-11 h-11 rounded-xl bg-otg-sodium/15 ring-1 ring-otg-sodium/30 flex items-center justify-center flex-shrink-0">
                <KeyRound className="w-5 h-5 text-otg-sodium" aria-hidden="true" />
              </div>
              <div>
                <h1 className="font-display font-bold text-2xl tracking-tight text-otg-text-bright">
                  Choose a new password
                </h1>
                <p className="text-sm text-otg-text-dim">
                  Make it strong — at least 8 characters.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div
                  role="alert"
                  className="bg-red-50 !bg-otg-danger/10 border border-otg-danger/30 rounded-xl p-3.5 flex items-start gap-2.5"
                >
                  <AlertCircle className="w-5 h-5 text-otg-danger flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-sm text-otg-text-bright">{error}</p>
                </div>
              )}

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-otg-text-bright mb-1.5"
                >
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
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
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Repeat your password"
                  className="input"
                />
              </div>

              <motion.button
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={isLoading || !password || !confirmPassword}
                className="btn btn-primary w-full text-base mt-1"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" aria-hidden="true" />
                    Resetting...
                  </>
                ) : (
                  'Reset password'
                )}
              </motion.button>
            </form>

            <p className="text-center text-sm text-otg-text-dim mt-6">
              Link expired?{' '}
              <Link
                href="/auth/reset-password"
                className="font-medium text-otg-sodium hover:text-otg-sodium-300 transition-colors"
              >
                Request a new one
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function ConfirmResetPage() {
  return (
    <Suspense
      fallback={
        <div className="relative min-h-screen flex items-center justify-center bg-otg-bg-dark overflow-hidden">
          <AmbientHalos />
          <Loader2 className="w-8 h-8 text-otg-sodium animate-spin relative" aria-hidden="true" />
        </div>
      }
    >
      <ConfirmResetForm />
    </Suspense>
  );
}
