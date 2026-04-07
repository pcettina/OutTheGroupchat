'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FocusTrap } from '@/components/accessibility';
import { logger } from '@/lib/logger';
import type { TripWithRelations, Destination, TripBudget } from '@/types';

interface EditTripModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: TripWithRelations;
  onSuccess?: () => void;
}

interface EditTripFormData {
  title: string;
  description: string;
  city: string;
  country: string;
  startDate: string;
  endDate: string;
  budgetTotal: string;
  budgetCurrency: string;
  isPublic: boolean;
}

const CURRENCIES = [
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '€' },
  { code: 'GBP', symbol: '£' },
  { code: 'CAD', symbol: 'C$' },
  { code: 'AUD', symbol: 'A$' },
  { code: 'JPY', symbol: '¥' },
];

function toDateInputValue(dateValue: string | Date): string {
  const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
  return d.toISOString().split('T')[0];
}

function buildInitialFormData(trip: TripWithRelations): EditTripFormData {
  const destination = trip.destination as unknown as Destination | null;
  const budget = trip.budget as unknown as TripBudget | null;

  return {
    title: trip.title ?? '',
    description: trip.description ?? '',
    city: destination?.city ?? '',
    country: destination?.country ?? '',
    startDate: trip.startDate ? toDateInputValue(trip.startDate) : '',
    endDate: trip.endDate ? toDateInputValue(trip.endDate) : '',
    budgetTotal: budget?.total != null ? String(budget.total) : '',
    budgetCurrency: budget?.currency ?? 'USD',
    isPublic: trip.isPublic ?? false,
  };
}

export function EditTripModal({ isOpen, onClose, trip, onSuccess }: EditTripModalProps) {
  const [formData, setFormData] = useState<EditTripFormData>(() => buildInitialFormData(trip));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-initialise form whenever the modal opens or the trip data changes
  useEffect(() => {
    if (isOpen) {
      setFormData(buildInitialFormData(trip));
      setError(null);
    }
  }, [isOpen, trip]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const { name, value, type } = e.target;
      if (type === 'checkbox') {
        const checked = (e.target as HTMLInputElement).checked;
        setFormData((prev) => ({ ...prev, [name]: checked }));
      } else {
        setFormData((prev) => ({ ...prev, [name]: value }));
      }
      setError(null);
    },
    []
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      setError('Trip title is required');
      return;
    }
    if (!formData.city.trim() || !formData.country.trim()) {
      setError('City and country are required');
      return;
    }
    if (!formData.startDate || !formData.endDate) {
      setError('Start and end dates are required');
      return;
    }
    if (formData.startDate > formData.endDate) {
      setError('End date must be on or after start date');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const existingDestination = trip.destination as unknown as Destination | null;
    const existingBudget = trip.budget as unknown as TripBudget | null;

    const payload: Record<string, unknown> = {
      title: formData.title.trim(),
      description: formData.description.trim(),
      destination: {
        city: formData.city.trim(),
        country: formData.country.trim(),
        ...(existingDestination?.coordinates && { coordinates: existingDestination.coordinates }),
        ...(existingDestination?.timezone && { timezone: existingDestination.timezone }),
      },
      startDate: formData.startDate,
      endDate: formData.endDate,
      isPublic: formData.isPublic,
    };

    // Only include budget if currency is set
    if (formData.budgetCurrency) {
      const budget: TripBudget = {
        currency: formData.budgetCurrency,
        total: formData.budgetTotal ? parseFloat(formData.budgetTotal) : (existingBudget?.total ?? 0),
      };
      if (existingBudget?.breakdown) {
        budget.breakdown = existingBudget.breakdown;
      }
      payload.budget = budget;
    }

    logger.debug({ tripId: trip.id, title: payload.title }, 'EditTripModal: submitting PATCH');

    try {
      const response = await fetch(`/api/trips/${trip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data: { success: boolean; error?: string; details?: unknown } = await response.json();

      if (!response.ok) {
        const errorMessage =
          data.error ?? `Failed to update trip (${response.status})`;
        logger.warn({ tripId: trip.id, status: response.status, error: data.error }, 'EditTripModal: PATCH failed');
        throw new Error(errorMessage);
      }

      logger.info({ tripId: trip.id }, 'EditTripModal: trip updated successfully');
      onSuccess?.();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update trip';
      logger.error({ tripId: trip.id, err }, 'EditTripModal: unexpected error');
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = useCallback(() => {
    if (!isSubmitting) {
      setError(null);
      onClose();
    }
  }, [isSubmitting, onClose]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[9998]"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Modal */}
          <FocusTrap active onEscape={handleClose}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-trip-title"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] w-full max-w-lg mx-4 max-h-[90vh] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <h2
                    id="edit-trip-title"
                    className="text-xl font-semibold text-slate-900 dark:text-white"
                  >
                    Edit Trip
                  </h2>
                  <button
                    onClick={handleClose}
                    className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    aria-label="Close"
                    disabled={isSubmitting}
                  >
                    <svg
                      className="w-5 h-5 text-slate-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Scrollable Form */}
              <div className="flex-1 overflow-y-auto">
                <form onSubmit={handleSubmit} id="edit-trip-form" className="p-6 space-y-5">
                  {/* Title */}
                  <div>
                    <label
                      htmlFor="edit-title"
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Trip Title *
                    </label>
                    <input
                      id="edit-title"
                      name="title"
                      type="text"
                      value={formData.title}
                      onChange={handleChange}
                      placeholder="e.g., Summer Europe Trip"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                      disabled={isSubmitting}
                      required
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label
                      htmlFor="edit-description"
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Description
                    </label>
                    <textarea
                      id="edit-description"
                      name="description"
                      value={formData.description}
                      onChange={handleChange}
                      placeholder="What's this trip about?"
                      rows={3}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all resize-none"
                      disabled={isSubmitting}
                    />
                  </div>

                  {/* Destination */}
                  <div>
                    <p className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Destination *
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="edit-city"
                          className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
                        >
                          City
                        </label>
                        <input
                          id="edit-city"
                          name="city"
                          type="text"
                          value={formData.city}
                          onChange={handleChange}
                          placeholder="Paris"
                          className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                          disabled={isSubmitting}
                          required
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="edit-country"
                          className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
                        >
                          Country
                        </label>
                        <input
                          id="edit-country"
                          name="country"
                          type="text"
                          value={formData.country}
                          onChange={handleChange}
                          placeholder="France"
                          className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                          disabled={isSubmitting}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Dates */}
                  <div>
                    <p className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Dates *
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="edit-startDate"
                          className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
                        >
                          Start Date
                        </label>
                        <input
                          id="edit-startDate"
                          name="startDate"
                          type="date"
                          value={formData.startDate}
                          onChange={handleChange}
                          className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all text-sm"
                          disabled={isSubmitting}
                          required
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="edit-endDate"
                          className="block text-xs text-slate-500 dark:text-slate-400 mb-1"
                        >
                          End Date
                        </label>
                        <input
                          id="edit-endDate"
                          name="endDate"
                          type="date"
                          value={formData.endDate}
                          onChange={handleChange}
                          min={formData.startDate}
                          className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all text-sm"
                          disabled={isSubmitting}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Budget */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Budget (optional)
                    </label>
                    <div className="flex gap-2">
                      <select
                        id="edit-budgetCurrency"
                        name="budgetCurrency"
                        value={formData.budgetCurrency}
                        onChange={handleChange}
                        className="w-28 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:border-emerald-500 outline-none transition-all text-sm"
                        disabled={isSubmitting}
                      >
                        {CURRENCIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.symbol} {c.code}
                          </option>
                        ))}
                      </select>
                      <input
                        id="edit-budgetTotal"
                        name="budgetTotal"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.budgetTotal}
                        onChange={handleChange}
                        placeholder="0.00"
                        className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>

                  {/* Visibility */}
                  <div className="flex items-center gap-3">
                    <input
                      id="edit-isPublic"
                      name="isPublic"
                      type="checkbox"
                      checked={formData.isPublic}
                      onChange={handleChange}
                      className="w-4 h-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
                      disabled={isSubmitting}
                    />
                    <label
                      htmlFor="edit-isPublic"
                      className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none"
                    >
                      Make this trip public (visible to all users)
                    </label>
                  </div>

                  {/* Error */}
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm"
                      role="alert"
                    >
                      {error}
                    </motion.div>
                  )}
                </form>
              </div>

              {/* Footer */}
              <div className="flex-shrink-0 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-b-2xl">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="edit-trip-form"
                    disabled={isSubmitting || !formData.title.trim()}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        Saving...
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </FocusTrap>
        </>
      )}
    </AnimatePresence>
  );
}

export default EditTripModal;
