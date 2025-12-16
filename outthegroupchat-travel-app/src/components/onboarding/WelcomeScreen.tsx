'use client';

import { motion } from 'framer-motion';

interface WelcomeScreenProps {
  userName?: string;
  onGetStarted: () => void;
}

const features = [
  {
    icon: '✈️',
    title: 'Plan Group Trips',
    description: 'Organize adventures with friends',
  },
  {
    icon: '🗳️',
    title: 'Vote Together',
    description: 'Decide destinations democratically',
  },
  {
    icon: '🤖',
    title: 'AI Assistant',
    description: 'Get personalized recommendations',
  },
  {
    icon: '📸',
    title: 'Share Memories',
    description: 'Document your journey',
  },
];

export function WelcomeScreen({ userName, onGetStarted }: WelcomeScreenProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center p-4">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="welcome-pattern" width="60" height="60" patternUnits="userSpaceOnUse">
              <circle cx="30" cy="30" r="2" fill="white" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#welcome-pattern)" />
        </svg>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative max-w-lg w-full bg-white dark:bg-slate-800 rounded-3xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="p-8 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 300 }}
            className="w-24 h-24 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mx-auto mb-6 shadow-lg"
          >
            <span className="text-5xl">🌍</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-3xl font-bold text-slate-900 dark:text-white mb-2"
          >
            {userName ? `Welcome, ${userName}!` : 'Welcome to OutTheGroupchat!'}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-slate-600 dark:text-slate-400"
          >
            Let's set up your profile and get you ready for your next adventure
          </motion.p>
        </div>

        {/* Features */}
        <div className="px-8 pb-4">
          <div className="grid grid-cols-2 gap-3">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + index * 0.1 }}
                className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl text-center"
              >
                <span className="text-2xl mb-2 block">{feature.icon}</span>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {feature.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="p-8 bg-slate-50 dark:bg-slate-700/30">
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onGetStarted}
            className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
          >
            Get Started
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </motion.button>

          <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-4">
            Takes about 2 minutes to complete
          </p>
        </div>
      </motion.div>
    </div>
  );
}

export default WelcomeScreen;
