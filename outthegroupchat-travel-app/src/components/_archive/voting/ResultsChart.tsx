'use client';

import { motion } from 'framer-motion';
import type { VotingResults } from '@/types';

interface ResultsChartProps {
  results: VotingResults;
}

export default function ResultsChart({ results }: ResultsChartProps) {
  const sortedResults = [...results.results].sort((a, b) => b.votes - a.votes);

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Voting Results</h3>
        <span className="text-sm text-gray-500">{results.totalVotes} total votes</span>
      </div>

      {/* Winner badge */}
      {results.winner && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 bg-gradient-to-r from-amber-50 to-yellow-50 rounded-xl border border-amber-200"
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl">🏆</span>
            <div>
              <p className="text-sm text-amber-600 font-medium">Winner</p>
              <p className="text-lg font-bold text-amber-900">{results.winner.title}</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Bar chart */}
      <div className="space-y-4">
        {sortedResults.map((result, index) => (
          <div key={result.optionId}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-gray-700 font-medium">Option {index + 1}</span>
              <span className="text-gray-500">{result.votes} ({result.percentage}%)</span>
            </div>
            <div className="h-8 bg-gray-100 rounded-lg overflow-hidden">
              <motion.div
                className={`h-full rounded-lg ${
                  index === 0 ? 'bg-primary' : 'bg-primary/50'
                }`}
                initial={{ width: 0 }}
                animate={{ width: `${result.percentage}%` }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Statistics */}
      <div className="mt-6 pt-6 border-t border-gray-100 grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-2xl font-bold text-gray-900">{results.totalVotes}</p>
          <p className="text-sm text-gray-500">Total Votes</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{sortedResults.length}</p>
          <p className="text-sm text-gray-500">Options</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-primary">{sortedResults[0]?.percentage || 0}%</p>
          <p className="text-sm text-gray-500">Top Choice</p>
        </div>
      </div>
    </div>
  );
}

