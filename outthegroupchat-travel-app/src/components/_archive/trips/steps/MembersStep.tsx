'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StepProps } from '../TripWizard';

interface MembersStepProps extends StepProps {
  onSubmit: () => void;
  isSubmitting: boolean;
}

export function MembersStep({
  data,
  onUpdate,
  onBack,
  onSubmit,
  isSubmitting,
}: MembersStepProps) {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleAddEmail = () => {
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      setEmailError('Please enter an email address');
      return;
    }

    if (!validateEmail(trimmedEmail)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    if (data.memberEmails.includes(trimmedEmail)) {
      setEmailError('This email has already been added');
      return;
    }

    onUpdate({ memberEmails: [...data.memberEmails, trimmedEmail] });
    setEmail('');
    setEmailError(null);
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    onUpdate({
      memberEmails: data.memberEmails.filter((e) => e !== emailToRemove),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddEmail();
    }
  };

  const totalMembers = data.memberEmails.length + 1; // Including the creator

  return (
    <div className="space-y-6">
      {/* Trip Summary */}
      <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Trip Summary</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Destination</span>
            <span className="font-medium text-slate-900 dark:text-white">
              {data.destination?.city}, {data.destination?.country}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Dates</span>
            <span className="font-medium text-slate-900 dark:text-white">
              {data.startDate?.toLocaleDateString()} - {data.endDate?.toLocaleDateString()}
            </span>
          </div>
          {data.budget && (
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Budget</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {data.budget.currency} {data.budget.total.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Add Members */}
      <div>
        <label
          htmlFor="member-email"
          className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
        >
          Invite friends by email
        </label>
        <div className="flex gap-2">
          <div className="flex-1">
            <input
              id="member-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder="friend@email.com"
              className={`w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-700 border-2 ${
                emailError
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-slate-200 dark:border-slate-600 focus:border-emerald-500'
              } focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all`}
            />
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleAddEmail}
            className="px-4 py-3 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 transition-colors"
          >
            Add
          </motion.button>
        </div>
        {emailError && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-2 text-sm text-red-500"
          >
            {emailError}
          </motion.p>
        )}
      </div>

      {/* Member Count */}
      <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <div>
          <p className="font-semibold text-emerald-800 dark:text-emerald-200">
            {totalMembers} {totalMembers === 1 ? 'person' : 'people'}
          </p>
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            {totalMembers === 1 ? 'Just you so far' : 'Including you'}
          </p>
        </div>
      </div>

      {/* Member List */}
      {data.memberEmails.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
            Invited Members
          </h3>
          <div className="space-y-2">
            <AnimatePresence>
              {data.memberEmails.map((memberEmail) => (
                <motion.div
                  key={memberEmail}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-semibold">
                      {memberEmail.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-slate-900 dark:text-white">{memberEmail}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveEmail(memberEmail)}
                    className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                    aria-label={`Remove ${memberEmail}`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Trip Description (Optional) */}
      <div>
        <label
          htmlFor="trip-description"
          className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
        >
          Trip Description (optional)
        </label>
        <textarea
          id="trip-description"
          value={data.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="Tell your friends what this trip is about..."
          rows={3}
          className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all resize-none"
        />
      </div>

      {/* Public Trip Toggle */}
      <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
        <div>
          <p className="font-medium text-slate-900 dark:text-white">Make trip public</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Allow others to discover your trip
          </p>
        </div>
        <button
          role="switch"
          aria-checked={data.isPublic}
          onClick={() => onUpdate({ isPublic: !data.isPublic })}
          className={`relative w-12 h-6 rounded-full transition-colors ${
            data.isPublic ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
          }`}
        >
          <motion.div
            initial={false}
            animate={{ x: data.isPublic ? 24 : 2 }}
            className="absolute top-1 w-4 h-4 bg-white rounded-full shadow"
          />
        </button>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onBack}
          disabled={isSubmitting}
          className="px-6 py-3 rounded-xl font-semibold border-2 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all flex items-center gap-2 disabled:opacity-50"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onSubmit}
          disabled={isSubmitting}
          className="px-6 py-3 rounded-xl font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg hover:shadow-xl transition-all flex items-center gap-2 disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Creating...
            </>
          ) : (
            <>
              Create Trip
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}
