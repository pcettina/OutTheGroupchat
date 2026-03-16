'use client';

import { motion } from 'framer-motion';

/**
 * Animated three-dot loading indicator shown while the AI is generating a response.
 */
export function ChatLoadingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex justify-start"
    >
      <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex gap-1">
          {[0, 0.2, 0.4].map((delay, i) => (
            <motion.span
              key={i}
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 0.6, delay }}
              className="w-2 h-2 bg-emerald-500 rounded-full"
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
