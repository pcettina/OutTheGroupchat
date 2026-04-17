'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useSession, signIn } from 'next-auth/react';
import { useState } from 'react';
import { Navigation } from '@/components/Navigation';

const features = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    title: 'Connect',
    description: 'Build your network of people who actually want to meet IRL.',
    color: 'emerald',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    title: 'Meetup',
    description: 'Post a meetup anywhere — coffee, drinks, a run, whatever.',
    color: 'amber',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    title: 'Show Up',
    description: 'One-tap RSVP, see who\'s coming, meet in person.',
    color: 'pink',
  },
];

const stats = [
  { value: '10K+', label: 'Meetups Posted' },
  { value: '50K+', label: 'People Connected' },
  { value: '100+', label: 'Cities' },
  { value: '4.9', label: 'Rating' },
];

export default function Home() {
  const { status } = useSession();
  const [isDemoLoading, setIsDemoLoading] = useState(false);

  const handleDemoLogin = async () => {
    setIsDemoLoading(true);
    try {
      // Sign in with demo credentials
      const result = await signIn('credentials', {
        email: 'alex@demo.com',
        password: 'demo123',
        redirect: false,
      });

      if (result?.ok) {
        window.location.href = '/discover';
      } else {
        // If demo user doesn't exist, try to create it first
        await fetch('/api/auth/demo', { method: 'POST' });
        // Then try signing in again
        const retryResult = await signIn('credentials', {
          email: 'alex@demo.com',
          password: 'demo123',
          redirect: false,
        });
        if (retryResult?.ok) {
          window.location.href = '/discover';
        }
      }
    } catch (error) {
      // silently handle demo login error
    } finally {
      setIsDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20">
      <Navigation />
      <div className="relative overflow-hidden pt-16">
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center">
        {/* Background Decorations */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-400/20 rounded-full blur-3xl" />
          <div className="absolute top-1/2 -left-40 w-80 h-80 bg-amber-400/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 right-1/3 w-72 h-72 bg-pink-400/20 rounded-full blur-3xl" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Text Content */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center lg:text-left"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-sm font-medium mb-6"
              >
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                From group chat to real life
              </motion.div>

              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-display font-bold leading-tight mb-6">
                <span className="text-gradient">The social app that</span>
                <br />
                <span className="text-slate-800 dark:text-white">gets you off your phone</span>
              </h1>

              <p className="text-xl text-slate-600 dark:text-slate-300 mb-8 max-w-xl mx-auto lg:mx-0">
                Connect with people near you. Post a meetup. Show up.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link
                  href={status === 'authenticated' ? '/discover' : '/auth/signup'}
                  className="btn btn-primary text-lg px-8 py-4"
                >
                  Find People Near You
                  <svg className="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
                {status !== 'authenticated' && (
                  <button
                    onClick={handleDemoLogin}
                    disabled={isDemoLoading}
                    className="btn btn-outline text-lg px-8 py-4 relative"
                  >
                    {isDemoLoading ? (
                      <>
                        <svg className="animate-spin w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Loading Demo...
                      </>
                    ) : (
                      <>
                        <span className="mr-2">🎮</span>
                        Explore Demo
                      </>
                    )}
                  </button>
                )}
                <Link
                  href="#features"
                  className="btn btn-ghost text-lg px-8 py-4 hidden sm:inline-flex"
                >
                  See How It Works
                </Link>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-4 mt-12 pt-8 border-t border-slate-200 dark:border-slate-700">
                {stats.map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + i * 0.1 }}
                    className="text-center"
                  >
                    <div className="text-2xl sm:text-3xl font-bold text-gradient">{stat.value}</div>
                    <div className="text-xs sm:text-sm text-slate-500">{stat.label}</div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Hero Image/Illustration */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="relative hidden lg:block"
            >
              <div className="relative w-full aspect-square">
                {/* Decorative Cards */}
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute top-0 right-0 w-64 card p-4 shadow-xl"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="avatar avatar-md">JD</div>
                    <div>
                      <div className="font-semibold text-sm">Coffee at Blank Street</div>
                      <div className="text-xs text-slate-500">Saturday 10am · Williamsburg</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="badge badge-primary">Coffee</span>
                    <span className="badge badge-secondary">Casual</span>
                  </div>
                </motion.div>

                <motion.div
                  animate={{ y: [0, 10, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute bottom-20 left-0 w-56 card p-4 shadow-xl"
                >
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Who&apos;s Coming</div>
                  <div className="text-2xl font-bold text-gradient mb-2">8 RSVPs</div>
                  <div className="progress">
                    <div className="progress-bar" style={{ width: '80%' }} />
                  </div>
                  <div className="text-xs text-slate-500 mt-1">2 spots left</div>
                </motion.div>

                <motion.div
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute top-1/3 left-1/4 w-48 card p-3 shadow-xl"
                >
                  <div className="flex items-center gap-2 text-emerald-600">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="font-medium text-sm">You&apos;re in — see you there!</span>
                  </div>
                </motion.div>

                {/* Main Illustration Background */}
                <div className="absolute inset-10 rounded-3xl bg-gradient-to-br from-emerald-400 via-teal-400 to-cyan-400 opacity-20 blur-2xl" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl sm:text-5xl font-display font-bold mb-4">
              Everything You Need to
              <br />
              <span className="text-gradient">Meet IRL</span>
            </h2>
            <p className="text-xl text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
              Stop making plans in the group chat that never happen. OutTheGroupchat makes showing up easy.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="card p-6 group hover:-translate-y-1 transition-transform"
              >
                <div className={`w-12 h-12 rounded-xl bg-${feature.color}-100 dark:bg-${feature.color}-900/30 text-${feature.color}-600 dark:text-${feature.color}-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-slate-600 dark:text-slate-300">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="card card-gradient p-12 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-amber-500/10" />
            <div className="relative">
              <h2 className="text-4xl font-display font-bold mb-4">
                Ready to Meet Someone?
              </h2>
              <p className="text-xl text-slate-600 dark:text-slate-300 mb-8 max-w-xl mx-auto">
                Post your first meetup in minutes and see who shows up. It&apos;s free to get started!
              </p>
              <Link
                href={status === 'authenticated' ? '/discover' : '/auth/signup'}
                className="btn btn-primary text-lg px-10 py-4"
              >
                Get Started
                <svg className="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                <span className="text-white font-bold text-sm">OG</span>
              </div>
              <span className="font-display font-semibold text-slate-700 dark:text-slate-200">
                OutTheGroupchat
              </span>
            </div>
            <p className="text-sm text-slate-500">
              &copy; {new Date().getFullYear()} OutTheGroupchat. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
      </div>
    </div>
  );
}
