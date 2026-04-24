'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { useSession, signIn } from 'next-auth/react';
import { useState } from 'react';
import { Users, MapPin, CheckCircle2, ArrowRight } from 'lucide-react';
import { Navigation } from '@/components/Navigation';

// Brief voice: sentence case everywhere. No emoji. No exclamations.
// "Corner booth at a dimly-lit Lower East Side bar at 10:47 PM."
const features = [
  {
    key: 'crew',
    tone: 'sodium' as const,
    icon: <Users className="w-6 h-6" />,
    title: 'Build your Crew',
    description:
      'Accept an invite, then text plans without texting. Your Crew sees when you’re around and when you’re out.',
  },
  {
    key: 'checkin',
    tone: 'tile' as const,
    icon: <MapPin className="w-6 h-6" />,
    title: 'Check in somewhere',
    description:
      'Post a meetup anywhere — coffee, a run, the bar on the corner — and set how long you’re around.',
  },
  {
    key: 'showup',
    tone: 'bourbon' as const,
    icon: <CheckCircle2 className="w-6 h-6" />,
    title: 'Actually show up',
    description:
      'One-tap RSVP. See who’s on the way. Skip the group-chat scrollback and be somewhere real.',
  },
];

// Dimly lit diner metrics. Sentence case.
const stats = [
  { value: '10k+', label: 'meetups posted' },
  { value: '50k+', label: 'people connected' },
  { value: '100+', label: 'cities' },
  { value: '4.9', label: 'rating' },
];

const toneClasses: Record<'sodium' | 'tile' | 'bourbon', string> = {
  sodium: 'bg-otg-sodium/15 text-otg-sodium ring-1 ring-otg-sodium/30',
  tile: 'bg-otg-tile/15 text-otg-tile ring-1 ring-otg-tile/30',
  bourbon: 'bg-otg-bourbon/15 text-otg-bourbon ring-1 ring-otg-bourbon/30',
};

export default function Home() {
  const { status } = useSession();
  const [isDemoLoading, setIsDemoLoading] = useState(false);

  const handleDemoLogin = async () => {
    setIsDemoLoading(true);
    try {
      const result = await signIn('credentials', {
        email: 'alex@demo.com',
        password: 'demo123',
        redirect: false,
      });

      if (result?.ok) {
        window.location.href = '/discover';
      } else {
        await fetch('/api/auth/demo', { method: 'POST' });
        const retryResult = await signIn('credentials', {
          email: 'alex@demo.com',
          password: 'demo123',
          redirect: false,
        });
        if (retryResult?.ok) {
          window.location.href = '/discover';
        }
      }
    } catch {
      // silently handle demo login error
    } finally {
      setIsDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-otg-bg-dark text-otg-text-bright">
      <Navigation />
      <div className="relative overflow-hidden pt-16">
        {/* Hero — "Real plans with real people. Tonight." */}
        <section className="relative min-h-[88vh] flex items-center">
          {/* Sodium-lamp halos — warm-black wash with sodium/bourbon/tile blooms */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-40 -right-40 w-[28rem] h-[28rem] bg-otg-sodium/20 rounded-full blur-3xl" />
            <div className="absolute top-1/2 -left-40 w-80 h-80 bg-otg-bourbon/15 rounded-full blur-3xl" />
            <div className="absolute -bottom-40 right-1/3 w-72 h-72 bg-otg-tile/15 rounded-full blur-3xl" />
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 relative">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* Text column */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="text-center lg:text-left"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.15 }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-otg-maraschino ring-1 ring-otg-sodium/30 text-otg-sodium text-sm font-medium mb-6"
                >
                  <span className="relative flex w-2 h-2">
                    <span className="absolute inset-0 rounded-full bg-otg-sodium animate-ping opacity-75" />
                    <span className="relative rounded-full w-2 h-2 bg-otg-sodium" />
                  </span>
                  NYC — last call, tonight
                </motion.div>

                <h1 className="font-display font-bold tracking-tight leading-[1.02] mb-6 text-5xl sm:text-6xl lg:text-7xl">
                  <span className="text-otg-text-bright">Real plans with</span>
                  <br />
                  <span className="text-otg-text-bright">real people. </span>
                  <span className="text-gradient">Tonight.</span>
                </h1>

                <p className="text-lg sm:text-xl text-otg-text-dim mb-4 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                  The social media app that wants to get you off your phone.
                </p>
                <p className="text-base sm:text-lg text-otg-text-dim mb-8 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                  NYC-first meetup network — check in, RSVP, invite your Crew, meet up IRL.
                </p>

                <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
                  <Link
                    href={status === 'authenticated' ? '/checkins' : '/auth/signup'}
                    className="btn btn-primary text-base px-7 py-3.5"
                  >
                    {status === 'authenticated' ? 'Who’s out tonight' : 'Get in the Groupchat'}
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Link>
                  {status !== 'authenticated' && (
                    <button
                      onClick={handleDemoLogin}
                      disabled={isDemoLoading}
                      className="btn btn-ghost text-base px-7 py-3.5 border border-otg-border"
                    >
                      {isDemoLoading ? (
                        <>
                          <svg className="animate-spin w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24">
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
                          Loading demo
                        </>
                      ) : (
                        'Look around first'
                      )}
                    </button>
                  )}
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-4 gap-4 mt-12 pt-8 border-t border-otg-border">
                  {stats.map((stat, i) => (
                    <motion.div
                      key={stat.label}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 + i * 0.1 }}
                      className="text-center"
                    >
                      <div className="text-2xl sm:text-3xl font-display font-bold text-gradient">
                        {stat.value}
                      </div>
                      <div className="text-xs sm:text-sm text-otg-text-dim mt-1">{stat.label}</div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              {/* Illustration column — floating receipt cards on warm-black */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="relative hidden lg:block"
              >
                <div className="relative w-full aspect-square">
                  {/* Floating card 1 — the meetup */}
                  <motion.div
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute top-0 right-0 w-64 card p-4 shadow-xl"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="avatar avatar-md">JD</div>
                      <div>
                        <div className="font-semibold text-sm text-otg-text-bright">
                          Coffee at Blank Street
                        </div>
                        <div className="text-xs text-otg-text-dim">
                          Saturday 10am · Williamsburg
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <span className="badge badge-primary">Coffee</span>
                      <span className="badge badge-secondary">Casual</span>
                    </div>
                  </motion.div>

                  {/* Floating card 2 — the RSVPs */}
                  <motion.div
                    animate={{ y: [0, 10, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute bottom-20 left-0 w-56 card p-4 shadow-xl"
                  >
                    <div className="text-sm font-medium text-otg-text-bright mb-2">Who’s coming</div>
                    <div className="text-2xl font-display font-bold text-gradient mb-2">8 RSVPs</div>
                    <div className="progress">
                      <div className="progress-bar" style={{ width: '80%' }} />
                    </div>
                    <div className="text-xs text-otg-text-dim mt-2">2 spots left</div>
                  </motion.div>

                  {/* Floating card 3 — the confirmation */}
                  <motion.div
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute top-1/3 left-1/4 w-52 card p-3 shadow-xl"
                  >
                    <div className="flex items-center gap-2 text-otg-tile">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="font-medium text-sm">You’re in — see you there</span>
                    </div>
                  </motion.div>

                  {/* Decorative logo halo */}
                  <div className="absolute inset-8 rounded-3xl bg-gradient-to-br from-otg-sodium/20 via-otg-bourbon/10 to-otg-tile/10 blur-2xl" />
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="features" className="py-20 bg-otg-maraschino/40 border-y border-otg-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-4xl sm:text-5xl font-display font-bold mb-4 tracking-tight">
                <span className="text-otg-text-bright">From group chat </span>
                <span className="font-serif italic text-otg-bourbon">to</span>
                <span className="text-otg-text-bright"> real life</span>
              </h2>
              <p className="text-lg text-otg-text-dim max-w-2xl mx-auto">
                Stop making plans that never happen. OutTheGroupchat makes showing up easy — in three
                quiet taps.
              </p>
            </motion.div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature, i) => (
                <motion.div
                  key={feature.key}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="card p-6 group hover:-translate-y-1 transition-transform"
                >
                  <div
                    className={`w-12 h-12 rounded-xl ${toneClasses[feature.tone]} flex items-center justify-center mb-5 group-hover:scale-105 transition-transform`}
                  >
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-display font-bold text-otg-text-bright mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-otg-text-dim leading-relaxed">{feature.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="card card-gradient p-12 relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-otg-sodium/10 via-transparent to-otg-bourbon/10 pointer-events-none" />
              <div className="relative">
                <h2 className="text-4xl font-display font-bold mb-4 tracking-tight text-otg-text-bright">
                  Put your phone down somewhere good.
                </h2>
                <p className="text-lg text-otg-text-dim mb-8 max-w-xl mx-auto">
                  Post your first meetup in a couple taps and see who shows up. Free to start.
                </p>
                <Link
                  href={status === 'authenticated' ? '/meetups/new' : '/auth/signup'}
                  className="btn btn-primary text-base px-8 py-3.5"
                >
                  Get in the Groupchat
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Link>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-otg-border py-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <Image
                  src="/logo-mark.svg"
                  alt=""
                  aria-hidden="true"
                  width={20}
                  height={32}
                  className="h-8 w-auto"
                />
                <span className="font-display font-semibold text-otg-text-bright">
                  OutTheGroupchat
                </span>
              </div>
              <p className="text-sm text-otg-text-dim">
                &copy; {new Date().getFullYear()} OutTheGroupchat. NYC.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
