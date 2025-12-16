'use client';

import { motion } from 'framer-motion';

interface Voter {
  id: string;
  name: string;
  image?: string;
}

interface VotingOptionProps {
  option: {
    id: string;
    title: string;
    description?: string;
    imageUrl?: string;
    metadata?: Record<string, unknown>;
  };
  isSelected: boolean;
  onSelect: () => void;
  showResults: boolean;
  voteCount: number;
  percentage: number;
  voters: Voter[];
  disabled: boolean;
  index: number;
}

export function VotingOption({
  option,
  isSelected,
  onSelect,
  showResults,
  voteCount,
  percentage,
  voters,
  disabled,
  index,
}: VotingOptionProps) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={onSelect}
      disabled={disabled}
      className={`w-full text-left p-4 rounded-xl border-2 transition-all relative overflow-hidden ${
        isSelected
          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30'
          : disabled
          ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 cursor-not-allowed'
          : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-slate-50 dark:hover:bg-slate-700/50'
      }`}
    >
      {/* Results Bar Background */}
      {showResults && percentage > 0 && (
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className={`absolute inset-y-0 left-0 ${
            isSelected
              ? 'bg-emerald-200/50 dark:bg-emerald-800/30'
              : 'bg-slate-200/50 dark:bg-slate-700/30'
          }`}
        />
      )}

      <div className="relative flex items-start gap-4">
        {/* Checkbox/Radio */}
        <div className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center mt-0.5 ${
          isSelected
            ? 'border-emerald-500 bg-emerald-500'
            : 'border-slate-300 dark:border-slate-600'
        }`}>
          {isSelected && (
            <motion.svg
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-4 h-4 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </motion.svg>
          )}
        </div>

        {/* Option Image */}
        {option.imageUrl && (
          <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-700">
            <img
              src={option.imageUrl}
              alt={option.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className={`font-medium ${
              isSelected ? 'text-emerald-900 dark:text-emerald-100' : 'text-slate-900 dark:text-white'
            }`}>
              {option.title}
            </h4>
            {showResults && (
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${
                  isSelected ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'
                }`}>
                  {percentage.toFixed(0)}%
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  ({voteCount} {voteCount === 1 ? 'vote' : 'votes'})
                </span>
              </div>
            )}
          </div>

          {option.description && (
            <p className={`text-sm mt-1 ${
              isSelected ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-600 dark:text-slate-400'
            }`}>
              {option.description}
            </p>
          )}

          {/* Metadata */}
          {option.metadata && (() => {
            const meta = option.metadata as { price?: string | number; duration?: string; location?: string };
            return (
              <div className="flex flex-wrap gap-2 mt-2">
                {meta.price && (
                  <span className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-slate-600 dark:text-slate-400">
                    💰 {String(meta.price)}
                  </span>
                )}
                {meta.duration && (
                  <span className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-slate-600 dark:text-slate-400">
                    ⏱️ {meta.duration}
                  </span>
                )}
                {meta.location && (
                  <span className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-slate-600 dark:text-slate-400">
                    📍 {meta.location}
                  </span>
                )}
              </div>
            );
          })()}

          {/* Voters */}
          {showResults && voters.length > 0 && (
            <div className="flex items-center gap-2 mt-3">
              <div className="flex -space-x-2">
                {voters.slice(0, 5).map((voter) => (
                  <div
                    key={voter.id}
                    className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 border-2 border-white dark:border-slate-800 flex items-center justify-center text-white text-xs font-medium"
                    title={voter.name}
                  >
                    {voter.image ? (
                      <img src={voter.image} alt={voter.name} className="w-full h-full rounded-full object-cover" />
                    ) : (
                      voter.name.charAt(0)
                    )}
                  </div>
                ))}
                {voters.length > 5 && (
                  <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-600 border-2 border-white dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 text-xs font-medium">
                    +{voters.length - 5}
                  </div>
                )}
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {voters.map((v) => v.name).slice(0, 3).join(', ')}
                {voters.length > 3 && ` +${voters.length - 3} more`}
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.button>
  );
}

export default VotingOption;
