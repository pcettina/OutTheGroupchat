'use client';

import { forwardRef } from 'react';
import { motion } from 'framer-motion';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  description?: string;
  className?: string;
}

const sizeClasses = {
  sm: { track: 'w-8 h-4', thumb: 'w-3 h-3', translate: 16 },
  md: { track: 'w-11 h-6', thumb: 'w-5 h-5', translate: 20 },
  lg: { track: 'w-14 h-7', thumb: 'w-6 h-6', translate: 28 },
};

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  (
    {
      checked,
      onChange,
      disabled = false,
      size = 'md',
      label,
      description,
      className = '',
    },
    ref
  ) => {
    const sizes = sizeClasses[size];

    const switchElement = (
      <button
        ref={ref}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex items-center rounded-full transition-colors ${sizes.track} ${
          checked
            ? 'bg-emerald-500'
            : 'bg-slate-200 dark:bg-slate-700'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
      >
        <motion.span
          initial={false}
          animate={{ x: checked ? sizes.translate : 2 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className={`${sizes.thumb} rounded-full bg-white shadow-sm`}
        />
      </button>
    );

    if (!label) return switchElement;

    return (
      <label className={`flex items-start gap-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
        {switchElement}
        <div className="flex-1">
          <span className="text-sm font-medium text-slate-900 dark:text-white">
            {label}
          </span>
          {description && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {description}
            </p>
          )}
        </div>
      </label>
    );
  }
);

Switch.displayName = 'Switch';

export default Switch;
