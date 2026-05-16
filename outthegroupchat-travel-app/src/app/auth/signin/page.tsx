'use client'

import { Suspense, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Loader2, CheckCircle2 } from 'lucide-react'

const POST_SIGNIN_DEFAULT_PATH = '/heatmap'

function resolveCallback(raw: string | null): string {
  if (!raw) return POST_SIGNIN_DEFAULT_PATH
  // Same-origin relative paths only — block //evil.com style open redirects.
  if (!raw.startsWith('/') || raw.startsWith('//')) return POST_SIGNIN_DEFAULT_PATH
  const path = raw.split('?')[0]
  // Pre-pivot routes (/trips, /dashboard) were removed and would 404.
  if (path === '/trips' || path === '/dashboard') return POST_SIGNIN_DEFAULT_PATH
  return raw
}

function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // NextAuth's withAuth middleware sends users here with ?callbackUrl=...; the
  // legacy ?redirect=... param is honored too for backwards-compat with old
  // links that may still be in the wild.
  const callbackParam = searchParams.get('callbackUrl') ?? searchParams.get('redirect')
  const redirectTo = resolveCallback(callbackParam)
  const justRegistered = searchParams.get('registered') === 'true'

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError('Invalid email or password')
      } else {
        router.push(redirectTo)
        router.refresh()
      }
    } catch {
      setError('Something went wrong. Try again in a sec.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    setError(null)
    try {
      // NextAuth's redirect callback will normalize callbackUrl, so it is safe
      // to forward the resolved (legacy-aware) path here.
      await signIn('google', { callbackUrl: redirectTo })
    } catch {
      setError('Google sign in failed. Try again in a sec.')
    } finally {
      setIsLoading(false)
    }
  }

  const signUpHref = callbackParam
    ? `/auth/signup?callbackUrl=${encodeURIComponent(callbackParam)}`
    : '/auth/signup'

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

      <div className="card p-6 sm:p-8">
        <div className="mb-6 text-center">
          <h1 className="font-display font-bold text-3xl sm:text-4xl tracking-tight text-otg-text-bright mb-2">
            <span className="text-gradient">Welcome back.</span>
          </h1>
          <p className="text-sm text-otg-text-dim">
            See where your Crew is tonight.
          </p>
        </div>

        {justRegistered && (
          <div
            role="status"
            className="mb-5 rounded-xl border border-otg-tile/40 bg-otg-tile/10 p-3.5 flex items-start gap-2"
          >
            <CheckCircle2 className="w-5 h-5 text-otg-tile flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-sm text-otg-tile">
              Account created. Sign in to keep going.
            </p>
          </div>
        )}

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
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-otg-text-bright">
                Password
              </label>
              <Link
                href="/auth/reset-password"
                className="text-xs font-medium text-otg-sodium hover:text-otg-sodium-300 transition-colors"
              >
                Forgot it?
              </Link>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="Your password"
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
                Signing in
              </>
            ) : (
              <>
                Sign in
                <ArrowRight className="w-5 h-5 ml-2" aria-hidden="true" />
              </>
            )}
          </button>
        </form>

        <div className="divider mt-7 mb-5">
          <span className="text-xs uppercase tracking-wider text-otg-text-dim">or</span>
        </div>

        <button
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl border border-otg-border bg-otg-bg-dark/40 text-otg-text-bright font-medium hover:border-otg-sodium hover:bg-otg-maraschino transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-otg-sodium focus:ring-offset-2 focus:ring-offset-otg-maraschino disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </button>

        <p className="mt-7 text-center text-sm text-otg-text-dim">
          New here?{' '}
          <Link
            href={signUpHref}
            className="font-medium text-otg-sodium hover:text-otg-sodium-300 transition-colors"
          >
            Make an account
          </Link>
        </p>
      </div>
    </div>
  )
}

function SignInLoading() {
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
      </div>
    </div>
  )
}

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-otg-bg-dark text-otg-text-bright px-4 sm:px-6 lg:px-8 py-12 relative overflow-hidden">
      {/* Sodium-lamp halos — same composition as marketing/home and signup */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[28rem] h-[28rem] bg-otg-sodium/15 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-otg-bourbon/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 right-1/3 w-72 h-72 bg-otg-tile/10 rounded-full blur-3xl" />
      </div>
      <Suspense fallback={<SignInLoading />}>
        <SignInForm />
      </Suspense>
    </div>
  )
}
