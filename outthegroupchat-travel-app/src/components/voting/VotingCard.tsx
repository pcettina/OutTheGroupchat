'use client';

import { motion } from 'framer-motion';
import type { VotingOption } from '@/types';

interface VotingCardProps {
  option: VotingOption;
  isSelected: boolean;
  voteCount?: number;
  totalVotes?: number;
  showResults?: boolean;
  onVote: () => void;
}

export default function VotingCard({
  option,
  isSelected,
  voteCount = 0,
  totalVotes = 0,
  showResults = false,
  onVote,
}: VotingCardProps) {
  const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;

  return (
    <motion.button
      type="button"
      onClick={onVote}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`w-full text-left p-5 rounded-2xl border-2 transition-all relative overflow-hidden ${
        isSelected
          ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      {/* Background progress bar (when showing results) */}
      {showResults && (
        <motion.div
          className="absolute inset-0 bg-primary/10"
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, delay: 0.2 }}
        />
      )}

      <div className="relative z-10">
        <div className="flex items-start gap-4">
          {/* Selection indicator */}
          <div className={`w-6 h-6 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
            isSelected
              ? 'border-primary bg-primary'
              : 'border-gray-300'
          }`}>
            {isSelected && (
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 text-lg">{option.title}</h3>
            {option.description && (
              <p className="text-gray-500 mt-1">{option.description}</p>
            )}
          </div>

          {/* Results */}
          {showResults && (
            <div className="text-right flex-shrink-0">
              <span className="text-2xl font-bold text-primary">{percentage}%</span>
              <p className="text-sm text-gray-500">{voteCount} votes</p>
            </div>
          )}
        </div>

        {/* Image if present */}
        {option.imageUrl && (
          <div className="mt-4 rounded-xl overflow-hidden h-40">
            <img
              src={option.imageUrl}
              alt={option.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}
      </div>
    </motion.button>
  );
}

