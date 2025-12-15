'use client';

import { ReactNode } from 'react';

interface VisuallyHiddenProps {
  children: ReactNode;
  as?: 'span' | 'div' | 'label';
}

/**
 * Visually hides content while keeping it accessible to screen readers.
 * Use this for labels, descriptions, or status updates that should be
 * announced but not visible on screen.
 */
export function VisuallyHidden({ children, as: Component = 'span' }: VisuallyHiddenProps) {
  return (
    <Component className="sr-only">
      {children}
    </Component>
  );
}

export default VisuallyHidden;

