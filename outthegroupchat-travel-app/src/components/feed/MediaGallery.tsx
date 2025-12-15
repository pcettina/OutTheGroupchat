'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

interface MediaItem {
  id: string;
  url: string;
  type: 'image' | 'video';
  alt?: string;
  thumbnail?: string;
}

interface MediaGalleryProps {
  media: MediaItem[];
  maxDisplay?: number;
  className?: string;
}

export function MediaGallery({ media, maxDisplay = 4, className = '' }: MediaGalleryProps) {
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  if (!media || media.length === 0) return null;

  const displayMedia = media.slice(0, maxDisplay);
  const remainingCount = media.length - maxDisplay;

  const openLightbox = (item: MediaItem, index: number) => {
    setSelectedMedia(item);
    setLightboxIndex(index);
  };

  const closeLightbox = () => {
    setSelectedMedia(null);
  };

  const navigateLightbox = (direction: 'prev' | 'next') => {
    const newIndex = direction === 'next'
      ? (lightboxIndex + 1) % media.length
      : (lightboxIndex - 1 + media.length) % media.length;
    setLightboxIndex(newIndex);
    setSelectedMedia(media[newIndex]);
  };

  // Dynamic grid layout based on number of items
  const getGridClass = () => {
    switch (displayMedia.length) {
      case 1:
        return 'grid-cols-1';
      case 2:
        return 'grid-cols-2';
      case 3:
        return 'grid-cols-2 grid-rows-2';
      default:
        return 'grid-cols-2 grid-rows-2';
    }
  };

  const getItemClass = (index: number) => {
    if (displayMedia.length === 3 && index === 0) {
      return 'row-span-2';
    }
    return '';
  };

  return (
    <>
      <div className={`grid ${getGridClass()} gap-1 rounded-xl overflow-hidden ${className}`}>
        {displayMedia.map((item, index) => (
          <motion.div
            key={item.id}
            className={`relative bg-slate-200 dark:bg-slate-700 cursor-pointer group ${getItemClass(index)}`}
            style={{ aspectRatio: displayMedia.length === 1 ? '16/9' : '1/1' }}
            onClick={() => openLightbox(item, index)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {item.type === 'image' ? (
              <Image
                src={item.url}
                alt={item.alt || 'Media'}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            ) : (
              <div className="relative w-full h-full">
                <video
                  src={item.url}
                  poster={item.thumbnail}
                  className="w-full h-full object-cover"
                  muted
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center">
                    <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              </div>
            )}

            {/* Overlay on hover */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />

            {/* Remaining count badge */}
            {index === maxDisplay - 1 && remainingCount > 0 && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <span className="text-white text-2xl font-bold">+{remainingCount}</span>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Lightbox Modal */}
      <AnimatePresence>
        {selectedMedia && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
            onClick={closeLightbox}
          >
            {/* Close button */}
            <button
              onClick={closeLightbox}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10"
            >
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Navigation buttons */}
            {media.length > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); navigateLightbox('prev'); }}
                  className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10"
                >
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); navigateLightbox('next'); }}
                  className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10"
                >
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}

            {/* Media display */}
            <motion.div
              key={selectedMedia.id}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-[90vw] max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {selectedMedia.type === 'image' ? (
                <img
                  src={selectedMedia.url}
                  alt={selectedMedia.alt || 'Media'}
                  className="max-w-full max-h-[90vh] object-contain"
                />
              ) : (
                <video
                  src={selectedMedia.url}
                  controls
                  autoPlay
                  className="max-w-full max-h-[90vh]"
                />
              )}
            </motion.div>

            {/* Counter */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-3 py-1 rounded-full">
              {lightboxIndex + 1} / {media.length}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default MediaGallery;

