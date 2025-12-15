'use client';

/**
 * Dropdown Menu component wrapper for Radix UI DropdownMenu
 * To use: npm install @radix-ui/react-dropdown-menu
 * 
 * This file provides styled, accessible dropdown menu components
 * following the OutTheGroupchat design system.
 */

import { ReactNode, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface DropdownMenuProps {
  children: ReactNode;
}

interface DropdownTriggerProps {
  children: ReactNode;
  asChild?: boolean;
}

interface DropdownContentProps {
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}

interface DropdownItemProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  icon?: ReactNode;
  shortcut?: string;
}

interface DropdownContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
}

import { createContext, useContext } from 'react';

const DropdownContext = createContext<DropdownContextType | null>(null);

function useDropdown() {
  const context = useContext(DropdownContext);
  if (!context) {
    throw new Error('Dropdown components must be used within a DropdownMenu');
  }
  return context;
}

export function DropdownMenu({ children }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  
  return (
    <DropdownContext.Provider value={{ open, setOpen }}>
      <div className="relative inline-block">
        {children}
      </div>
    </DropdownContext.Provider>
  );
}

export function DropdownTrigger({ children }: DropdownTriggerProps) {
  const { open, setOpen } = useDropdown();
  
  return (
    <div onClick={() => setOpen(!open)} role="button" aria-haspopup="menu" aria-expanded={open}>
      {children}
    </div>
  );
}

export function DropdownContent({ children, align = 'end', className = '' }: DropdownContentProps) {
  const { open, setOpen } = useDropdown();
  const ref = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, setOpen]);

  // Close on Escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, setOpen]);

  const alignmentClasses = {
    start: 'left-0',
    center: 'left-1/2 -translate-x-1/2',
    end: 'right-0',
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          role="menu"
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className={`
            absolute ${alignmentClasses[align]} mt-2 z-50
            min-w-[200px] py-1
            bg-white dark:bg-slate-800 rounded-xl shadow-xl
            border border-slate-200 dark:border-slate-700
            ${className}
          `}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function DropdownItem({
  children,
  onClick,
  disabled = false,
  destructive = false,
  icon,
  shortcut,
}: DropdownItemProps) {
  const { setOpen } = useDropdown();

  const handleClick = () => {
    if (!disabled && onClick) {
      onClick();
      setOpen(false);
    }
  };

  return (
    <button
      role="menuitem"
      onClick={handleClick}
      disabled={disabled}
      className={`
        w-full flex items-center gap-2 px-4 py-2 text-sm text-left
        transition-colors outline-none
        ${disabled 
          ? 'opacity-50 cursor-not-allowed' 
          : destructive
            ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
        }
        focus:bg-slate-100 dark:focus:bg-slate-700
      `}
    >
      {icon && <span className="w-4 h-4">{icon}</span>}
      <span className="flex-1">{children}</span>
      {shortcut && (
        <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">
          {shortcut}
        </span>
      )}
    </button>
  );
}

export function DropdownSeparator() {
  return <div className="my-1 h-px bg-slate-200 dark:bg-slate-700" role="separator" />;
}

export function DropdownLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`px-4 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 ${className}`}>
      {children}
    </div>
  );
}

export default DropdownMenu;

