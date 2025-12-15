'use client';

/**
 * Dialog component wrapper for Radix UI Dialog
 * To use: npm install @radix-ui/react-dialog
 * 
 * This file provides styled, accessible dialog components
 * following the OutTheGroupchat design system.
 */

import { ReactNode, Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FocusTrap } from '@/components/accessibility';

// Placeholder types for when Radix isn't installed
// Replace these with actual Radix imports when package is available:
// import * as DialogPrimitive from '@radix-ui/react-dialog';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

interface DialogContentProps {
  children: ReactNode;
  title?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
  onClose?: () => void;
}

interface DialogTriggerProps {
  children: ReactNode;
  asChild?: boolean;
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-4xl',
};

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  return (
    <Fragment>
      {children}
      {/* When Radix is installed, use DialogPrimitive.Root */}
    </Fragment>
  );
}

export function DialogTrigger({ children }: DialogTriggerProps) {
  return <Fragment>{children}</Fragment>;
}

export function DialogContent({
  children,
  title,
  description,
  size = 'md',
  className = '',
  onClose,
}: DialogContentProps) {
  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <FocusTrap active onEscape={onClose}>
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? 'dialog-title' : undefined}
          aria-describedby={description ? 'dialog-description' : undefined}
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
          className={`
            fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50
            w-full ${sizeClasses[size]} mx-4
            bg-white dark:bg-slate-800 rounded-2xl shadow-2xl
            border border-slate-200 dark:border-slate-700
            ${className}
          `}
        >
          {/* Close button */}
          {onClose && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              aria-label="Close dialog"
            >
              <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          {/* Header */}
          {(title || description) && (
            <div className="px-6 pt-6 pb-0">
              {title && (
                <h2 id="dialog-title" className="text-xl font-semibold text-slate-900 dark:text-white">
                  {title}
                </h2>
              )}
              {description && (
                <p id="dialog-description" className="mt-2 text-slate-500 dark:text-slate-400">
                  {description}
                </p>
              )}
            </div>
          )}

          {/* Content */}
          <div className="p-6">
            {children}
          </div>
        </motion.div>
      </FocusTrap>
    </AnimatePresence>
  );
}

export function DialogHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`px-6 pt-6 ${className}`}>
      {children}
    </div>
  );
}

export function DialogTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h2 id="dialog-title" className={`text-xl font-semibold text-slate-900 dark:text-white ${className}`}>
      {children}
    </h2>
  );
}

export function DialogDescription({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p id="dialog-description" className={`mt-2 text-slate-500 dark:text-slate-400 ${className}`}>
      {children}
    </p>
  );
}

export function DialogFooter({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`px-6 pb-6 flex justify-end gap-3 ${className}`}>
      {children}
    </div>
  );
}

export default Dialog;

