'use client';

import { useState } from 'react';

interface SkipLink {
  id: string;
  label: string;
}

const defaultLinks: SkipLink[] = [
  { id: 'main-content', label: 'Skip to main content' },
  { id: 'navigation', label: 'Skip to navigation' },
];

interface SkipLinksProps {
  links?: SkipLink[];
}

export function SkipLinks({ links = defaultLinks }: SkipLinksProps) {
  const [focusedIndex, setFocusedIndex] = useState(-1);

  return (
    <div className="sr-only focus-within:not-sr-only fixed top-0 left-0 z-[100] p-4">
      <nav aria-label="Skip links">
        <ul className="flex flex-col gap-2">
          {links.map((link, index) => (
            <li key={link.id}>
              <a
                href={`#${link.id}`}
                onFocus={() => setFocusedIndex(index)}
                onBlur={() => setFocusedIndex(-1)}
                className={`
                  block px-4 py-2 bg-emerald-500 text-white font-medium rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2
                  transform transition-transform duration-150
                  ${focusedIndex === index ? 'translate-y-0' : '-translate-y-full'}
                `}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export default SkipLinks;

