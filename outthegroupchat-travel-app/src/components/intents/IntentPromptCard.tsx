'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight } from 'lucide-react';

interface IntentPromptCardProps {
  /** Override the default copy. */
  message?: string;
  href?: string;
}

/**
 * Feed/home prompt — the always-on entry point to /intents/new.
 * Per V1 plan: "What are you up for tonight?" surfaces as a card at the top
 * of the feed and any home-style surface.
 */
export function IntentPromptCard({
  message = 'What are you up for tonight?',
  href = '/intents/new',
}: IntentPromptCardProps) {
  return (
    <Link href={href} className="block" data-testid="intent-prompt-card">
      <motion.div
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.98 }}
        className="flex items-center justify-between rounded-2xl border border-otg-sodium/30 bg-gradient-to-br from-otg-sodium/10 via-otg-surface to-otg-surface p-5 transition hover:border-otg-sodium/60"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-otg-sodium/20 text-otg-sodium">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="font-semibold text-otg-text-bright">{message}</p>
            <p className="text-xs text-otg-text-muted">Signal an Intent — your Crew will see it.</p>
          </div>
        </div>
        <ArrowRight className="h-5 w-5 text-otg-sodium" aria-hidden="true" />
      </motion.div>
    </Link>
  );
}
