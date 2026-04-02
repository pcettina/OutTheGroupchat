'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { VotingCard, ResultsChart } from '@/components/voting';
import { CreateVotingModal } from '@/components/voting/CreateVotingModal';
import { logger } from '@/lib/logger';
import type { VotingOption, VotingResults } from '@/types';

interface VotingSession {
  id: string;
  title: string;
  description?: string;
  type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'RANKED';
  options: VotingOption[];
  status: 'ACTIVE' | 'CLOSED';
  expiresAt?: string;
  userVote?: string[];
}

export default function VotePage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const tripId = params.tripId as string;

  const [sessions, setSessions] = useState<VotingSession[]>([]);
  const [activeSession, setActiveSession] = useState<VotingSession | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [results, setResults] = useState<VotingResults | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isOwnerOrAdmin, setIsOwnerOrAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fetchVotingSessions = useCallback(async () => {
    try {
      const res = await fetch(`/api/trips/${tripId}/voting`);
      if (!res.ok) throw new Error('Failed to fetch voting sessions');
      const data = await res.json();
      setSessions(data.data || []);
      if (data.data?.[0]) {
        setActiveSession(data.data[0]);
        if (data.data[0].userVote) {
          setSelectedOptions(data.data[0].userVote);
          setShowResults(true);
        }
      }
    } catch (err) {
      logger.error({ err, tripId }, 'Failed to fetch voting sessions');
      setError('Failed to load voting sessions. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    fetchVotingSessions();
  }, [fetchVotingSessions]);

  // Check if current user is owner/admin
  useEffect(() => {
    async function checkRole() {
      if (!session?.user?.id) return;
      try {
        const res = await fetch(`/api/trips/${tripId}`);
        if (!res.ok) return;
        const data = await res.json();
        const trip = data.data;
        if (!trip) return;
        const isOwner = trip.ownerId === session.user.id;
        const isAdmin = trip.members?.some(
          (m: { userId: string; role: string }) =>
            m.userId === session.user.id && (m.role === 'OWNER' || m.role === 'ADMIN')
        );
        setIsOwnerOrAdmin(isOwner || isAdmin);
      } catch {
        // ignore
      }
    }
    checkRole();
  }, [tripId, session?.user?.id]);

  const handleVote = (optionId: string) => {
    if (showResults || !activeSession) return;

    if (activeSession.type === 'SINGLE_CHOICE') {
      setSelectedOptions([optionId]);
    } else {
      setSelectedOptions(prev =>
        prev.includes(optionId)
          ? prev.filter(id => id !== optionId)
          : [...prev, optionId]
      );
    }
  };

  const submitVote = async () => {
    if (!activeSession || selectedOptions.length === 0) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/voting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSession.id,
          votes: selectedOptions,
        }),
      });

      if (!res.ok) throw new Error('Failed to submit vote');

      const data = await res.json();
      setResults(data.data);
      setShowResults(true);
    } catch (err) {
      logger.error({ err, tripId, sessionId: activeSession?.id }, 'Failed to submit vote');
      setSubmitError('Failed to submit your vote. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVoteCreated = () => {
    setIsLoading(true);
    fetchVotingSessions();
  };

  // Calculate time remaining
  const getTimeRemaining = () => {
    if (!activeSession?.expiresAt) return null;
    const now = new Date();
    const expires = new Date(activeSession.expiresAt);
    const diff = expires.getTime() - now.getTime();

    if (diff <= 0) return 'Expired';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days} day${days > 1 ? 's' : ''} left`;
    }
    return `${hours}h ${minutes}m left`;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/2" />
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-gray-200 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <h2 className="text-xl font-semibold text-red-700 mb-2">Something went wrong</h2>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => { setError(null); setIsLoading(true); fetchVotingSessions(); }}
            className="px-6 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">No Active Votes</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            {isOwnerOrAdmin
              ? 'Create a vote to let your group decide together.'
              : "There are no voting sessions yet. Check back later!"}
          </p>

          {isOwnerOrAdmin && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all"
            >
              Create a Vote
            </button>
          )}

          <div className="mt-4">
            <button
              onClick={() => router.back()}
              className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              Back to trip
            </button>
          </div>
        </div>

        <CreateVotingModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          tripId={tripId}
          onCreated={handleVoteCreated}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </button>

          {isOwnerOrAdmin && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Vote
            </button>
          )}
        </div>

        {activeSession && (
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{activeSession.title}</h1>
              {activeSession.description && (
                <p className="text-gray-500 mt-1">{activeSession.description}</p>
              )}
            </div>
            {getTimeRemaining() && (
              <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium whitespace-nowrap">
                {getTimeRemaining()}
              </span>
            )}
          </div>
        )}
      </motion.div>

      {/* Session tabs if multiple */}
      {sessions.length > 1 && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setActiveSession(s);
                setSelectedOptions(s.userVote || []);
                setShowResults(!!s.userVote);
                setResults(null);
              }}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                activeSession?.id === s.id
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s.title}
            </button>
          ))}
        </div>
      )}

      {/* Voting options */}
      {activeSession && !showResults && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-3 mb-6"
        >
          {activeSession.options.map((option) => (
            <VotingCard
              key={option.id}
              option={option}
              isSelected={selectedOptions.includes(option.id)}
              onVote={() => handleVote(option.id)}
            />
          ))}
        </motion.div>
      )}

      {/* Results */}
      {showResults && results && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <ResultsChart results={results} />
        </motion.div>
      )}

      {/* Show results with vote counts */}
      {showResults && !results && activeSession && (
        <div className="space-y-3 mb-6">
          {activeSession.options.map((option) => (
            <VotingCard
              key={option.id}
              option={option}
              isSelected={selectedOptions.includes(option.id)}
              showResults={true}
              voteCount={0}
              totalVotes={0}
              onVote={() => {}}
            />
          ))}
        </div>
      )}

      {/* Submit error */}
      {submitError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-center">
          <p className="text-red-600 text-sm">{submitError}</p>
        </div>
      )}

      {/* Submit button */}
      {!showResults && activeSession?.status === 'ACTIVE' && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => { setSubmitError(null); void submitVote(); }}
          disabled={selectedOptions.length === 0 || isSubmitting}
          className="w-full py-4 bg-primary text-white font-semibold rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Submitting...' : 'Submit Vote'}
        </motion.button>
      )}

      {/* Already voted message */}
      {showResults && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-xl text-center">
          <p className="text-green-700 font-medium">You&apos;ve submitted your vote</p>
        </div>
      )}

      <CreateVotingModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        tripId={tripId}
        onCreated={handleVoteCreated}
      />
    </div>
  );
}
