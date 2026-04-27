'use client'

import { Suspense, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const redirectTo = searchParams.get('redirect') || '/trips'
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
      setError('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    setError(null)
    try {
      await signIn('google', { callbackUrl: redirectTo })
    } catch {
      setError('An error occurred with Google sign in.')
    } finally {
      setIsLoading(false)
    }
  }

  const signUpHref = redirectTo !== '/trips'
    ? `/auth/signup?redirect=${encodeURIComponent(redirectTo)}`
    : '/auth/signup'

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
        {/* warm sodium halo */}
        <div className="pointer-events-none absolute -top-24 -right-24 w-56 h-56 rounded-full bg-otg-sodium/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 w-56 h-56 rounded-full bg-otg-bourbon/10 blur-3xl" />

        <div className="relative">
          <div className="mb-6">
            <h2 className="font-display font-bold text-3xl tracking-tight text-otg-text-bright">
              Sign in to your account
            </h2>
            <p className="mt-2 text-sm text-otg-text-dim">
              New here?{' '}
              <Link
                href={signUpHref}
                className="font-medium text-otg-sodium hover:text-otg-sodium-300 transition-colors"
              >
                create a new account
              </Link>
            </p>
          </div>

          {justRegistered && (
            <div className="bg-green-50 !bg-otg-tile/10 border border-otg-tile/30 rounded-xl p-3.5 mb-5 flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-otg-tile flex-shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-sm text-otg-text-bright">
                Account created successfully! Sign in to keep going.
              </p>
            </div>
          )}

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
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-otg-text-bright"
                >
                  Password
                </label>
                <Link
                  href="/auth/reset-password"
                  className="text-xs font-medium text-otg-sodium hover:text-otg-sodium-300 transition-colors"
                >
                  Forgot your password?
                </Link>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="input"
              />
            </div>

            <motion.button
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={isLoading}
              className="btn btn-primary w-full text-base"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" aria-hidden="true" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </motion.button>
          </form>

          <div className="divider mt-6 mb-5">
            <span className="text-xs uppercase tracking-wider text-otg-text-dim">
              or continue with
            </span>
          </div>

          <button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="btn btn-ghost w-full text-base border border-otg-border hover:border-otg-sodium/50"
          >
            <svg
              className="w-5 h-5 mr-2"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                fill="#EA4335"
                d="M12 5.5c1.7 0 3.2.6 4.4 1.6l3.2-3.2C17.5 1.9 14.9 1 12 1 7.4 1 3.4 3.6 1.5 7.4l3.7 2.9C6.1 7.5 8.8 5.5 12 5.5z"
              />
              <path
                fill="#34A853"
                d="M23 12c0-.8-.1-1.6-.2-2.4H12v4.6h6.2c-.3 1.4-1.1 2.6-2.3 3.4l3.6 2.8C21.7 18.3 23 15.4 23 12z"
              />
              <path
                fill="#FBBC04"
                d="M5.2 14.3c-.3-.8-.4-1.6-.4-2.3 0-.8.1-1.6.4-2.3L1.5 6.8C.5 8.4 0 10.1 0 12s.5 3.6 1.5 5.2l3.7-2.9z"
              />
              <path
                fill="#4285F4"
                d="M12 23c3 0 5.5-1 7.4-2.7l-3.6-2.8c-1 .7-2.3 1.1-3.8 1.1-3.2 0-5.9-2-6.8-4.8L1.5 16.6C3.4 20.4 7.4 23 12 23z"
              />
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>

      <p className="text-center text-xs text-otg-text-dim mt-6">
        Real plans with real people. Tonight.
      </p>
    </motion.div>
  )
}

function SignInLoading() {
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
      </div>
    </div>
  )
}

export default function SignInPage() {
  return (
    <div className="relative min-h-screen flex items-center justify-center bg-otg-bg-dark px-4 py-12 sm:px-6 lg:px-8 overflow-hidden">
      {/* Sodium-lamp ambient halos */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[28rem] h-[28rem] bg-otg-sodium/15 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[24rem] h-[24rem] bg-otg-bourbon/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/3 w-72 h-72 bg-otg-tile/10 rounded-full blur-3xl" />
      </div>

      <Suspense fallback={<SignInLoading />}>
        <SignInForm />
      </Suspense>
    </div>
  )
}
