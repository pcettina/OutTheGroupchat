'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';

interface UnsplashResult {
  id: string;
  url: string;
  smallUrl: string;
  thumbUrl: string;
  alt: string;
  width: number;
  height: number;
  photographer: string;
  photographerUrl: string;
  unsplashUrl: string;
}

interface ImagePickerProps {
  onSelect: (imageUrl: string) => void;
  selectedUrl?: string;
  initialQuery?: string;
  className?: string;
}

export function ImagePicker({ onSelect, selectedUrl, initialQuery = '', className = '' }: ImagePickerProps) {
  const [query, setQuery] = useState(initialQuery);
  const [images, setImages] = useState<UnsplashResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();

  const searchImages = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setImages([]);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/images/search?q=${encodeURIComponent(searchQuery)}&perPage=12`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      if (data.success) {
        setImages(data.data);
      }
    } catch {
      setImages([]);
    } finally {
      setIsLoading(false);
      setHasSearched(true);
    }
  }, []);

  // Auto-search on initial query
  useEffect(() => {
    if (initialQuery) {
      searchImages(initialQuery);
    }
  }, [initialQuery, searchImages]);

  // Debounced search on query change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) return;

    debounceRef.current = setTimeout(() => {
      searchImages(query);
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, searchImages]);

  return (
    <div className={className}>
      {/* Search input */}
      <div className="relative mb-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a cover image..."
          className="w-full px-4 py-2.5 pl-10 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all text-sm"
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="aspect-video bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {/* Results grid */}
      {!isLoading && images.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {images.map((img) => (
              <button
                key={img.id}
                onClick={() => onSelect(img.url)}
                className={`relative aspect-video rounded-lg overflow-hidden group transition-all ${
                  selectedUrl === img.url
                    ? 'ring-2 ring-emerald-500 ring-offset-2'
                    : 'hover:ring-2 hover:ring-slate-300'
                }`}
              >
                <Image
                  src={img.smallUrl}
                  alt={img.alt}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 33vw, 200px"
                />
                {selectedUrl === img.url && (
                  <div className="absolute inset-0 bg-emerald-500/30 flex items-center justify-center">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
          {/* Unsplash attribution (required by TOS) */}
          <p className="text-xs text-slate-400 mt-2 text-center">
            Photos by{' '}
            <a href="https://unsplash.com/?utm_source=outthegroupchat&utm_medium=referral" target="_blank" rel="noopener noreferrer" className="underline">
              Unsplash
            </a>
          </p>
        </>
      )}

      {/* No results */}
      {!isLoading && hasSearched && images.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-4">
          No images found. Try a different search term.
        </p>
      )}
    </div>
  );
}

export default ImagePicker;
