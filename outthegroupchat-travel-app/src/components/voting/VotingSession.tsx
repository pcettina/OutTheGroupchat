'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { VotingOption } from './VotingOption';
import ResultsChart from './ResultsChart';
import { VotingDeadline } from './VotingDeadline';

interface VotingOptionData {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  metadata?: Record<string, unknown>;
}

interface VotingSessionData {
  id: string;
  tripId: string;
  title: string;
  description?: string;
  type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'RANKING';
  status: 'ACTIVE' | 'CLOSED' | 'CANCELLED';
  options: VotingOptionData[];
  expiresAt?: string;
  createdAt: string;
}

interface VoteResult {
  optionId: string;
  votes: number;
  percentage: number;
  voters: { id: string; name: string; image?: string }[];
}

interface VotingSessionProps {
  session: VotingSessionData;
  tripId: string;
  currentUserId: string;
  onVoteComplete?: () => void;
}

export function VotingSession({
  session,
  tripId,
  currentUserId,
  onVoteComplete,
}: VotingSessionProps) {
  const queryClient = useQueryClient();
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);

  // Fetch current voting results
  const { data: results, isLoading: isLoadingResults } = useQuery({
    queryKey: ['voting', session.id, 'results'],
    queryFn: async () => {
      const response = await fetch(`/api/trips/${tripId}/voting?sessionId=${session.id}`);
      if (!response.ok) throw new Error('Failed to fetch results');
      return response.json() as Promise<{
        totalVotes: number;
        results: VoteResult[];
        userVote?: string[];
      }>;
    },
    refetchInterval: session.status === 'ACTIVE' ? 10000 : false, // Poll while active
  });

  // Check if user has already voted
  useEffect(() => {
    if (results?.userVote && results.userVote.length > 0) {
      setHasVoted(true);
      setSelectedOptions(results.userVote);
      setShowResults(true);
    }
  }, [results?.userVote]);

  // Submit vote mutation
  const voteMutation = useMutation({
    mutationFn: async (optionIds: string[]) => {
      const response = await fetch(`/api/trips/${tripId}/voting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          optionIds,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to submit vote');
      }
      return response.json();
    },
    onSuccess: () => {
      setHasVoted(true);
      setShowResults(true);
      queryClient.invalidateQueries({ queryKey: ['voting', session.id] });
      onVoteComplete?.();
    },
  });

  const handleOptionSelect = (optionId: string) => {
    if (hasVoted || session.status !== 'ACTIVE') return;

    if (session.type === 'SINGLE_CHOICE') {
      setSelectedOptions([optionId]);
    } else if (session.type === 'MULTIPLE_CHOICE') {
      setSelectedOptions((prev) =>
        prev.includes(optionId)
          ? prev.filter((id) => id !== optionId)
          : [...prev, optionId]
      );
    }
  };

  const handleSubmitVote = () => {
    if (selectedOptions.length === 0) return;
    voteMutation.mutate(selectedOptions);
  };

  const isExpired = session.expiresAt && new Date(session.expiresAt) < new Date();
  const canVote = session.status === 'ACTIVE' && !hasVoted && !isExpired;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
    >
      {/* Header */}
      <div className="p-5 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">🗳️</span>
              <h3 className="font-semibold text-slate-900 dark:text-white text-lg">
                {session.title}
              </h3>
            </div>
            {session.description && (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {session.description}
              </p>
            )}
          </div>
          <span className={`px-3 py-1 text-xs font-medium rounded-full ${
            session.status === 'ACTIVE'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
              : session.status === 'CLOSED'
              ? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          }`}>
            {session.status}
          </span>
        </div>

        {/* Deadline */}
        {session.expiresAt && (
          <div className="mt-3">
            <VotingDeadline expiresAt={session.expiresAt} />
          </div>
        )}

        {/* Vote Type Info */}
        <div className="mt-3 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span>
            {session.type === 'SINGLE_CHOICE' && '✓ Choose one option'}
            {session.type === 'MULTIPLE_CHOICE' && '✓ Choose multiple options'}
            {session.type === 'RANKING' && '✓ Rank your preferences'}
          </span>
          {results && (
            <span>• {results.totalVotes} {results.totalVotes === 1 ? 'vote' : 'votes'} cast</span>
          )}
        </div>
      </div>

      {/* Voting Options */}
      <div className="p-5">
        <div className="space-y-3">
          <AnimatePresence>
            {session.options.map((option, index) => {
              const result = results?.results.find((r) => r.optionId === option.id);
              return (
                <VotingOption
                  key={option.id}
                  option={option}
                  isSelected={selectedOptions.includes(option.id)}
                  onSelect={() => handleOptionSelect(option.id)}
                  showResults={showResults || hasVoted}
                  voteCount={result?.votes || 0}
                  percentage={result?.percentage || 0}
                  voters={result?.voters || []}
                  disabled={!canVote}
                  index={index}
                />
              );
            })}
          </AnimatePresence>
        </div>

        {/* Submit Button */}
        {canVote && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={handleSubmitVote}
            disabled={selectedOptions.length === 0 || voteMutation.isPending}
            className="w-full mt-6 px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {voteMutation.isPending ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Submitting...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Submit Vote
              </>
            )}
          </motion.button>
        )}

        {/* Voted Status */}
        {hasVoted && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-center"
          >
            <p className="text-emerald-700 dark:text-emerald-300 text-sm font-medium flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Your vote has been recorded!
            </p>
          </motion.div>
        )}

        {/* Error Message */}
        {voteMutation.isError && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-center"
          >
            <p className="text-red-700 dark:text-red-300 text-sm">
              {voteMutation.error?.message || 'Failed to submit vote. Please try again.'}
            </p>
          </motion.div>
        )}

        {/* Toggle Results View */}
        {hasVoted && (
          <button
            onClick={() => setShowResults(!showResults)}
            className="w-full mt-3 py-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          >
            {showResults ? 'Hide detailed results' : 'Show detailed results'}
          </button>
        )}
      </div>
    </motion.div>
  );
}

export default VotingSession;
