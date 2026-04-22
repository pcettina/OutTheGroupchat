import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About — OutTheGroupchat',
  description:
    'OutTheGroupchat is the social network built to get you off your phone and back in the room with your people.',
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      {/* Nav strip */}
      <header className="border-b border-slate-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="text-emerald-600 font-semibold text-lg tracking-tight hover:text-emerald-700 transition-colors"
          >
            OutTheGroupchat
          </Link>
          <Link
            href="/meetups"
            className="text-sm text-slate-600 hover:text-emerald-600 transition-colors"
          >
            See meetups &rarr;
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16">
        {/* Hero */}
        <section className="mb-16">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-600 mb-4">
            About
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 leading-tight mb-6">
            The social media app that wants to get you{' '}
            <span className="text-emerald-600">off your phone.</span>
          </h1>
          <p className="text-xl text-slate-600 leading-relaxed">
            Most social apps are engineered to keep you scrolling. We built
            OutTheGroupchat to do the opposite — to get you out the door and
            face-to-face with the people you actually care about.
          </p>
        </section>

        {/* Mission */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Our mission</h2>
          <p className="text-slate-600 leading-relaxed mb-4">
            Friendship is maintained in person. Text threads keep groups
            technically connected, but they rarely turn into actual plans. We
            believe the gap between &ldquo;we should hang&rdquo; and actually
            hanging is a product problem — and we&apos;re building the product
            that closes it.
          </p>
          <p className="text-slate-600 leading-relaxed">
            OutTheGroupchat is purpose-built for IRL meetups. No algorithm
            designed to maximize watch-time. No infinite feed. Just a simple
            loop: build your Crew, post a meetup, show up.
          </p>
        </section>

        {/* How it works */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-slate-900 mb-8">How it works</h2>
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <div className="text-3xl mb-3">👥</div>
              <h3 className="font-semibold text-slate-900 mb-2">Build your Crew</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Follow people you actually want to hang with. Your Crew is a
                close-knit circle, not a follower count.
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <div className="text-3xl mb-3">📍</div>
              <h3 className="font-semibold text-slate-900 mb-2">Post a meetup</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Drop a time and place. Invite your Crew. See who&apos;s in with
                a single tap — no DM thread required.
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <div className="text-3xl mb-3">🙌</div>
              <h3 className="font-semibold text-slate-900 mb-2">Show up</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Check in when you arrive. The app celebrates the moment you put
                the phone away.
              </p>
            </div>
          </div>
        </section>

        {/* Why different */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            Why we&apos;re different
          </h2>
          <ul className="space-y-4 text-slate-600">
            <li className="flex gap-3">
              <span className="mt-1 text-emerald-500 flex-shrink-0">&#10003;</span>
              <span>
                <strong className="text-slate-800">No engagement farming.</strong>{' '}
                There are no likes, no reaction counts, and no viral mechanics.
                Your interactions stay between you and your Crew.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-1 text-emerald-500 flex-shrink-0">&#10003;</span>
              <span>
                <strong className="text-slate-800">Designed for brevity.</strong>{' '}
                A meetup post is a time, a place, and a vibe. We intentionally
                left out the essay box.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-1 text-emerald-500 flex-shrink-0">&#10003;</span>
              <span>
                <strong className="text-slate-800">Real-time, not real-enough.</strong>{' '}
                Check-ins are live. When someone in your Crew is out tonight,
                you&apos;ll know — and you can join them.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-1 text-emerald-500 flex-shrink-0">&#10003;</span>
              <span>
                <strong className="text-slate-800">The Crew model.</strong>{' '}
                Your social graph is intentionally small. A Crew is a mutual
                connection — both people have to opt in, which keeps the signal
                high.
              </span>
            </li>
          </ul>
        </section>

        {/* CTA */}
        <section className="bg-emerald-600 rounded-3xl p-10 text-center text-white">
          <h2 className="text-2xl font-bold mb-3">Ready to get out there?</h2>
          <p className="text-emerald-100 mb-6">
            See what&apos;s happening or plan your own meetup.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/meetups"
              className="inline-block bg-white text-emerald-700 font-semibold px-6 py-3 rounded-xl hover:bg-emerald-50 transition-colors"
            >
              Browse meetups
            </Link>
            <Link
              href="/"
              className="inline-block border border-white/40 text-white font-semibold px-6 py-3 rounded-xl hover:bg-white/10 transition-colors"
            >
              Go home
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
