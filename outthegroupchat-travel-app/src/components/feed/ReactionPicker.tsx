'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Reaction {
  emoji: string;
  label: string;
  count: number;
}

interface ReactionPickerProps {
  itemId: string;
  itemType: 'trip' | 'activity' | 'post';
  reactions: Reaction[];
  userReaction?: string | null;
  onReact: (emoji: string) => void;
  onUnreact: () => void;
  disabled?: boolean;
}

const defaultReactions: Omit<Reaction, 'count'>[] = [
  { emoji: '❤️', label: 'Love' },
  { emoji: '🔥', label: 'Fire' },
  { emoji: '✈️', label: 'Travel' },
  { emoji: '🎉', label: 'Celebrate' },
  { emoji: '😍', label: 'Amazing' },
  { emoji: '👏', label: 'Applause' },
];

export function ReactionPicker({
  itemId,
  itemType,
  reactions = [],
  userReaction,
  onReact,
  onUnreact,
  disabled = false,
}: ReactionPickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();

  // Close picker on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShowPicker(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setShowPicker(false), 300);
  };

  const handleReaction = (emoji: string) => {
    if (disabled || isAnimating) return;
    
    setIsAnimating(true);
    if (userReaction === emoji) {
      onUnreact();
    } else {
      onReact(emoji);
    }
    setShowPicker(false);
    setTimeout(() => setIsAnimating(false), 300);
  };

  // Calculate total reactions
  const totalReactions = reactions.reduce((sum, r) => sum + r.count, 0);

  // Get top 3 reactions to display
  const topReactions = [...reactions]
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return (
    <div ref={pickerRef} className="relative">
      {/* Main Button */}
      <motion.button
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={() => userReaction ? onUnreact() : handleReaction('❤️')}
        disabled={disabled}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
          userReaction
            ? 'text-rose-500 bg-rose-50 dark:bg-rose-900/20'
            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        whileTap={{ scale: 0.95 }}
      >
        {/* Display user's reaction or default heart */}
        <motion.span
          className="text-lg"
          animate={isAnimating ? { scale: [1, 1.4, 1] } : {}}
          transition={{ duration: 0.3 }}
        >
          {userReaction || '❤️'}
        </motion.span>
        
        {/* Reaction count or label */}
        <span>{totalReactions > 0 ? totalReactions : 'React'}</span>
      </motion.button>

      {/* Reaction Summary (shown below when there are reactions) */}
      {topReactions.length > 0 && (
        <div className="absolute -bottom-6 left-0 flex items-center gap-0.5">
          {topReactions.map((reaction, index) => (
            <motion.span
              key={reaction.emoji}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              className="text-xs"
            >
              {reaction.emoji}
            </motion.span>
          ))}
          {totalReactions > 0 && (
            <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">
              {totalReactions}
            </span>
          )}
        </div>
      )}

      {/* Reaction Picker Popup */}
      <AnimatePresence>
        {showPicker && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="absolute bottom-full left-0 mb-2 z-50"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div className="flex items-center gap-1 p-2 bg-white dark:bg-slate-800 rounded-full shadow-xl border border-slate-200 dark:border-slate-700">
              {defaultReactions.map((reaction, index) => {
                const isSelected = userReaction === reaction.emoji;
                const reactionData = reactions.find((r) => r.emoji === reaction.emoji);
                
                return (
                  <motion.button
                    key={reaction.emoji}
                    onClick={() => handleReaction(reaction.emoji)}
                    className={`relative p-2 rounded-full transition-colors ${
                      isSelected
                        ? 'bg-rose-100 dark:bg-rose-900/30'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    whileHover={{ scale: 1.3, y: -5 }}
                    whileTap={{ scale: 0.9 }}
                    title={reaction.label}
                  >
                    <span className="text-xl block">{reaction.emoji}</span>
                    
                    {/* Count Badge */}
                    {reactionData && reactionData.count > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 text-[10px] font-bold text-white bg-emerald-500 rounded-full flex items-center justify-center">
                        {reactionData.count}
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>
            
            {/* Arrow */}
            <div className="absolute -bottom-1 left-6 w-3 h-3 bg-white dark:bg-slate-800 border-r border-b border-slate-200 dark:border-slate-700 transform rotate-45" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ReactionPicker;
