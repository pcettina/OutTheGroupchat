'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { VotingCard, ResultsChart } from '@/components/voting';
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
  const tripId = params.tripId as string;

  const [sessions, setSessions] = useState<VotingSession[]>([]);
  const [activeSession, setActiveSession] = useState<VotingSession | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [results, setResults] = useState<VotingResults | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    async function fetchVotingSessions() {
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
        console.error('Failed to load voting sessions:', err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchVotingSessions();
  }, [tripId]);

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
      console.error('Failed to submit vote:', err);
    } finally {
      setIsSubmitting(false);
    }
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

  if (sessions.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
          <span className="text-4xl mb-4 block">🗳️</span>
          <h2 className="text-xl font-semibold text-yellow-700 mb-2">No Active Votes</h2>
          <p className="text-yellow-600 mb-4">There are no voting sessions for this trip yet.</p>
          <button
            onClick={() => router.back()}
            className="text-primary font-medium hover:underline"
          >
            Go back to trip
          </button>
        </div>
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
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </button>

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
                ⏱️ {getTimeRemaining()}
              </span>
            )}
          </div>
        )}
      </motion.div>

      {/* Session tabs if multiple */}
      {sessions.length > 1 && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => {
                setActiveSession(session);
                setSelectedOptions(session.userVote || []);
                setShowResults(!!session.userVote);
                setResults(null);
              }}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                activeSession?.id === session.id
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {session.title}
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

      {/* Submit button */}
      {!showResults && activeSession?.status === 'ACTIVE' && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={submitVote}
          disabled={selectedOptions.length === 0 || isSubmitting}
          className="w-full py-4 bg-primary text-white font-semibold rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Submitting...' : 'Submit Vote'}
        </motion.button>
      )}

      {/* Already voted message */}
      {showResults && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-xl text-center">
          <p className="text-green-700 font-medium">✓ You've submitted your vote</p>
        </div>
      )}
    </div>
  );
}

