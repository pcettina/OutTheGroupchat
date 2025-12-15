'use client';

import { useEffect, useRef, useCallback, ReactNode } from 'react';

interface FocusTrapProps {
  children: ReactNode;
  active?: boolean;
  onEscape?: () => void;
  initialFocus?: string;
  returnFocus?: boolean;
  className?: string;
}

export function FocusTrap({
  children,
  active = true,
  onEscape,
  initialFocus,
  returnFocus = true,
  className = '',
}: FocusTrapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<Element | null>(null);

  // Get all focusable elements within the container
  const getFocusableElements = useCallback(() => {
    if (!containerRef.current) return [];
    
    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]',
    ].join(', ');

    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(focusableSelectors)
    ).filter(
      (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
    );
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!active) return;

    // Handle Escape
    if (event.key === 'Escape' && onEscape) {
      event.preventDefault();
      onEscape();
      return;
    }

    // Handle Tab
    if (event.key === 'Tab') {
      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      // Shift + Tab from first element - go to last
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }
      // Tab from last element - go to first
      else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }, [active, onEscape, getFocusableElements]);

  // Set initial focus
  useEffect(() => {
    if (!active) return;

    // Store current active element
    previousActiveElement.current = document.activeElement;

    // Focus initial element or first focusable
    if (initialFocus) {
      const element = containerRef.current?.querySelector<HTMLElement>(initialFocus);
      element?.focus();
    } else {
      const focusableElements = getFocusableElements();
      focusableElements[0]?.focus();
    }

    // Add keyboard listener
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      
      // Return focus to previous element
      if (returnFocus && previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus();
      }
    };
  }, [active, initialFocus, returnFocus, handleKeyDown, getFocusableElements]);

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
}

export default FocusTrap;

