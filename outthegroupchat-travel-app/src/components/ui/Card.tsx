'use client';

import { forwardRef } from 'react';
import { motion } from 'framer-motion';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'gradient' | 'glass';
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      children,
      variant = 'default',
      hover = true,
      padding = 'md',
      className = '',
      ...props
    },
    ref
  ) => {
    const baseClasses = 'rounded-2xl transition-all duration-300';

    const variantClasses = {
      default: 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-md',
      gradient: 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-md relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-br before:from-emerald-500/5 before:to-amber-500/5',
      glass: 'bg-white/70 dark:bg-slate-800/70 backdrop-blur-lg border border-white/20 dark:border-slate-700/50',
    };

    const paddingClasses = {
      none: '',
      sm: 'p-4',
      md: 'p-6',
      lg: 'p-8',
    };

    const hoverClasses = hover ? 'hover:shadow-lg hover:-translate-y-1' : '';

    return (
      <motion.div
        ref={ref as any}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`${baseClasses} ${variantClasses[variant]} ${paddingClasses[padding]} ${hoverClasses} ${className}`}
        {...(props as any)}
      >
        {children}
      </motion.div>
    );
  }
);

Card.displayName = 'Card';

export default Card;

