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

export default EmptyState;
