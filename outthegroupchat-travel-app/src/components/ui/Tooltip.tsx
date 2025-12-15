'use client';

/**
 * Tooltip component wrapper for Radix UI Tooltip
 * To use: npm install @radix-ui/react-tooltip
 * 
 * This file provides styled, accessible tooltip components
 * following the OutTheGroupchat design system.
 */

import { ReactNode, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  delayMs?: number;
  disabled?: boolean;
}

const sidePositions = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
};

const alignOffsets = {
  start: {
    top: 'left-0 translate-x-0',
    bottom: 'left-0 translate-x-0',
    left: 'top-0 translate-y-0',
    right: 'top-0 translate-y-0',
  },
  center: {
    top: 'left-1/2 -translate-x-1/2',
    bottom: 'left-1/2 -translate-x-1/2',
    left: 'top-1/2 -translate-y-1/2',
    right: 'top-1/2 -translate-y-1/2',
  },
  end: {
    top: 'right-0 translate-x-0 left-auto',
    bottom: 'right-0 translate-x-0 left-auto',
    left: 'bottom-0 translate-y-0 top-auto',
    right: 'bottom-0 translate-y-0 top-auto',
  },
};

const arrowPositions = {
  top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent',
  right: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent',
  bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent',
  left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent',
};

export function Tooltip({
  children,
  content,
  side = 'top',
  align = 'center',
  delayMs = 200,
  disabled = false,
}: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (disabled) return;
    const id = setTimeout(() => setIsOpen(true), delayMs);
    setTimeoutId(id);
  };

  const handleMouseLeave = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      setTimeoutId(null);
    }
    setIsOpen(false);
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
    >
      {children}
      
      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="tooltip"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className={`
              absolute z-50 ${sidePositions[side]}
              px-3 py-1.5 text-sm
              bg-slate-900 dark:bg-slate-100
              text-white dark:text-slate-900
              rounded-lg shadow-lg
              whitespace-nowrap
              pointer-events-none
            `}
          >
            {content}
            
            {/* Arrow */}
            <div
              className={`
                absolute w-0 h-0
                border-4 border-slate-900 dark:border-slate-100
                ${arrowPositions[side]}
              `}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Provider for global tooltip settings
// When Radix is installed, use TooltipProvider from @radix-ui/react-tooltip
export function TooltipProvider({ children, delayDuration = 200 }: { children: ReactNode; delayDuration?: number }) {
  return <>{children}</>;
}

export default Tooltip;

