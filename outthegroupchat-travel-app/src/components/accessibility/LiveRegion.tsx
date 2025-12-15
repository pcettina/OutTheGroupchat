'use client';

import { ReactNode, useEffect, useState } from 'react';

interface LiveRegionProps {
  children: ReactNode;
  politeness?: 'polite' | 'assertive' | 'off';
  atomic?: boolean;
  relevant?: 'additions' | 'removals' | 'text' | 'all' | 'additions text' | 'additions removals' | 'removals text' | 'removals additions' | 'text additions' | 'text removals';
  className?: string;
}

/**
 * A live region component that announces dynamic content changes to screen readers.
 * 
 * - 'polite': Waits until user is idle (default)
 * - 'assertive': Interrupts immediately (use sparingly for critical updates)
 * - 'off': Disables announcements
 */
export function LiveRegion({
  children,
  politeness = 'polite',
  atomic = true,
  relevant = 'additions text',
  className = '',
}: LiveRegionProps) {
  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic={atomic}
      aria-relevant={relevant}
      className={`sr-only ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Hook for announcing messages to screen readers
 */
export function useAnnounce() {
  const [message, setMessage] = useState('');

  const announce = (text: string, clearAfter = 1000) => {
    setMessage(text);
    if (clearAfter > 0) {
      setTimeout(() => setMessage(''), clearAfter);
    }
  };

  const Announcer = ({ politeness = 'polite' }: { politeness?: 'polite' | 'assertive' }) => (
    <LiveRegion politeness={politeness}>
      {message}
    </LiveRegion>
  );

  return { announce, Announcer, message };
}

export default LiveRegion;

