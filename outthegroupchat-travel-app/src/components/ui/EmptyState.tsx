'use client';

import { motion } from 'framer-motion';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  variant?: 'default' | 'compact';
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  variant = 'default',
  className = '',
}: EmptyStateProps) {
  if (variant === 'compact') {
    return (
      <div className={`text-center py-6 ${className}`}>
        {icon && (
          <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-400">
            {icon}
          </div>
        )}
        <p className="text-sm text-slate-600 dark:text-slate-400">{title}</p>
        {description && (
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">{description}</p>
        )}
        {action && (
          <button
            onClick={action.onClick}
            className="mt-3 text-xs text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
          >
            {action.label} →
          </button>
        )}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`text-center py-12 px-6 ${className}`}
    >
      {icon && (
        <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4 text-slate-400">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-slate-600 dark:text-slate-400 max-w-sm mx-auto mb-6">
          {description}
        </p>
      )}
      {action && (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={action.onClick}
          className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all"
        >
          {action.label}
        </motion.button>
      )}
    </motion.div>
  );
}

// Preset empty states
export const EmptyTrips = ({ onCreateTrip }: { onCreateTrip: () => void }) => (
  <EmptyState
    icon={
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    }
    title="No trips yet"
    description="Start planning your first adventure with friends!"
    action={{ label: "Create Trip", onClick: onCreateTrip }}
  />
);

export const EmptyNotifications = () => (
  <EmptyState
    icon={
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    }
    title="All caught up!"
    description="You have no new notifications"
    variant="compact"
  />
);

export default EmptyState;
