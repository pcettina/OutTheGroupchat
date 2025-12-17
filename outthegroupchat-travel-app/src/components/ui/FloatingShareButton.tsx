'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ShareData {
  title: string;
  description?: string;
  url?: string;
}

interface FloatingShareButtonProps {
  shareData: ShareData;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

export function FloatingShareButton({ 
  shareData, 
  position = 'bottom-right' 
}: FloatingShareButtonProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = shareData.url || (typeof window !== 'undefined' ? window.location.href : '');

  const positionClasses = {
    'bottom-right': 'bottom-20 right-4',
    'bottom-left': 'bottom-20 left-4',
    'top-right': 'top-20 right-4',
    'top-left': 'top-20 left-4',
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareData.title,
          text: shareData.description || 'Check this out on OutTheGroupchat!',
          url: shareUrl,
        });
        setIsExpanded(false);
      } catch (err) {
        // User cancelled
      }
    }
  };

  const handleTwitterShare = () => {
    const text = shareData.description 
      ? `${shareData.title} - ${shareData.description}`
      : shareData.title;
    window.open(
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`,
      '_blank',
      'width=600,height=400'
    );
  };

  const handleWhatsAppShare = () => {
    const text = `${shareData.title} ${shareUrl}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      '_blank'
    );
  };

  return (
    <div className={`fixed ${positionClasses[position]} z-40`}>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            className="absolute bottom-16 right-0 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-3 min-w-[200px]"
          >
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 px-1">
              Share this page
            </p>
            
            <div className="space-y-1">
              {/* Copy Link */}
              <button
                onClick={handleCopyLink}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-left"
              >
                <span className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                  {copied ? (
                    <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-slate-600 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </span>
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  {copied ? 'Copied!' : 'Copy link'}
                </span>
              </button>

              {/* Native Share (Mobile) */}
              {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                <button
                  onClick={handleNativeShare}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-left"
                >
                  <span className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                  </span>
                  <span className="text-sm text-slate-700 dark:text-slate-300">Share via...</span>
                </button>
              )}

              {/* Twitter/X */}
              <button
                onClick={handleTwitterShare}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-left"
              >
                <span className="w-8 h-8 rounded-full bg-black flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </span>
                <span className="text-sm text-slate-700 dark:text-slate-300">Twitter / X</span>
              </button>

              {/* WhatsApp */}
              <button
                onClick={handleWhatsAppShare}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-left"
              >
                <span className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </span>
                <span className="text-sm text-slate-700 dark:text-slate-300">WhatsApp</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-colors ${
          isExpanded 
            ? 'bg-slate-700 dark:bg-slate-600' 
            : 'bg-emerald-500 hover:bg-emerald-600'
        }`}
      >
        <motion.svg
          animate={{ rotate: isExpanded ? 45 : 0 }}
          className="w-6 h-6 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {isExpanded ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          )}
        </motion.svg>
      </motion.button>
    </div>
  );
}

export default FloatingShareButton;

