'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CreateVotingModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripId: string;
  onCreated: () => void;
}

type VotingType = 'DESTINATION' | 'ACTIVITY' | 'DATE' | 'ACCOMMODATION' | 'CUSTOM';

interface OptionInput {
  id: string;
  title: string;
  description: string;
}

const votingTypes: { value: VotingType; label: string; placeholder: string }[] = [
  { value: 'DESTINATION', label: 'Destination', placeholder: 'e.g., Nashville, Miami...' },
  { value: 'ACTIVITY', label: 'Activity', placeholder: 'e.g., Beach day, Museum tour...' },
  { value: 'DATE', label: 'Date', placeholder: 'e.g., June 15-18, July 4 weekend...' },
  { value: 'ACCOMMODATION', label: 'Accommodation', placeholder: 'e.g., Downtown Airbnb, Beach house...' },
  { value: 'CUSTOM', label: 'Custom', placeholder: 'Enter an option...' },
];

function generateId() {
  return `opt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function CreateVotingModal({ isOpen, onClose, tripId, onCreated }: CreateVotingModalProps) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<VotingType>('DESTINATION');
  const [options, setOptions] = useState<OptionInput[]>([
    { id: generateId(), title: '', description: '' },
    { id: generateId(), title: '', description: '' },
  ]);
  const [expirationHours, setExpirationHours] = useState(24);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedType = votingTypes.find((t) => t.value === type)!;

  const addOption = () => {
    setOptions([...options, { id: generateId(), title: '', description: '' }]);
  };

  const removeOption = (id: string) => {
    if (options.length <= 2) return;
    setOptions(options.filter((o) => o.id !== id));
  };

  const updateOption = (id: string, field: 'title' | 'description', value: string) => {
    setOptions(options.map((o) => (o.id === id ? { ...o, [field]: value } : o)));
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Please enter a title for the vote');
      return;
    }

    const validOptions = options.filter((o) => o.title.trim());
    if (validOptions.length < 2) {
      setError('Please add at least 2 options');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/trips/${tripId}/voting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          title: title.trim(),
          options: validOptions.map((o) => ({
            id: o.id,
            title: o.title.trim(),
            description: o.description.trim() || undefined,
          })),
          expirationHours,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create voting session');
      }

      onCreated();
      onClose();
      // Reset form
      setTitle('');
      setType('DESTINATION');
      setOptions([
        { id: generateId(), title: '', description: '' },
        { id: generateId(), title: '', description: '' },
      ]);
      setExpirationHours(24);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create vote');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/50"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-lg max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Create a Vote</h2>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-4 space-y-5">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Vote Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Where should we go?"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
              />
            </div>

            {/* Type */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Vote Type
              </label>
              <div className="flex flex-wrap gap-2">
                {votingTypes.map((vt) => (
                  <button
                    key={vt.value}
                    onClick={() => setType(vt.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      type === vt.value
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border border-transparent hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    {vt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Options */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Options
              </label>
              <div className="space-y-3">
                {options.map((option, index) => (
                  <div key={option.id} className="flex items-start gap-2">
                    <span className="mt-2.5 text-sm text-slate-400 font-medium w-5 text-center">
                      {index + 1}
                    </span>
                    <div className="flex-1 space-y-1">
                      <input
                        type="text"
                        value={option.title}
                        onChange={(e) => updateOption(option.id, 'title', e.target.value)}
                        placeholder={selectedType.placeholder}
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:border-emerald-500 outline-none text-sm"
                      />
                      <input
                        type="text"
                        value={option.description}
                        onChange={(e) => updateOption(option.id, 'description', e.target.value)}
                        placeholder="Description (optional)"
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:border-emerald-500 outline-none text-xs text-slate-500"
                      />
                    </div>
                    <button
                      onClick={() => removeOption(option.id)}
                      disabled={options.length <= 2}
                      className="mt-2 p-1 text-slate-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={addOption}
                className="mt-2 text-sm text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add option
              </button>
            </div>

            {/* Expiration */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Voting Duration
              </label>
              <select
                value={expirationHours}
                onChange={(e) => setExpirationHours(Number(e.target.value))}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:border-emerald-500 outline-none text-sm"
              >
                <option value={6}>6 hours</option>
                <option value={12}>12 hours</option>
                <option value={24}>24 hours</option>
                <option value={48}>48 hours</option>
                <option value={72}>3 days</option>
                <option value={168}>7 days</option>
              </select>
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-600 dark:text-slate-400 font-medium hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-6 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 transition-all"
            >
              {isSubmitting ? 'Creating...' : 'Create Vote'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export default CreateVotingModal;
