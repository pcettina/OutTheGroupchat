'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FocusTrap } from '@/components/accessibility';

// Activity categories matching Prisma enum
const ACTIVITY_CATEGORIES = [
  { value: 'FOOD', label: 'Food & Dining', icon: '🍽️' },
  { value: 'CULTURE', label: 'Culture & Museums', icon: '🏛️' },
  { value: 'SHOPPING', label: 'Shopping', icon: '🛍️' },
  { value: 'NATURE', label: 'Nature & Outdoors', icon: '🌿' },
  { value: 'ENTERTAINMENT', label: 'Entertainment', icon: '🎭' },
  { value: 'SPORTS', label: 'Sports & Recreation', icon: '⚽' },
  { value: 'NIGHTLIFE', label: 'Nightlife', icon: '🌙' },
  { value: 'TRANSPORTATION', label: 'Transportation', icon: '🚗' },
  { value: 'ACCOMMODATION', label: 'Accommodation', icon: '🏨' },
  { value: 'OTHER', label: 'Other', icon: '📌' },
] as const;

type ActivityCategory = typeof ACTIVITY_CATEGORIES[number]['value'];

interface AddActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripId: string;
  onActivityAdded?: () => void;
  preselectedDate?: Date;
}

interface ActivityFormData {
  name: string;
  description: string;
  category: ActivityCategory;
  date: string;
  startTime: string;
  endTime: string;
  cost: string;
  currency: string;
  location: string;
  bookingUrl: string;
}

const initialFormData: ActivityFormData = {
  name: '',
  description: '',
  category: 'OTHER',
  date: '',
  startTime: '',
  endTime: '',
  cost: '',
  currency: 'USD',
  location: '',
  bookingUrl: '',
};

const currencies = [
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '€' },
  { code: 'GBP', symbol: '£' },
  { code: 'CAD', symbol: 'C$' },
  { code: 'AUD', symbol: 'A$' },
];

export function AddActivityModal({
  isOpen,
  onClose,
  tripId,
  onActivityAdded,
  preselectedDate,
}: AddActivityModalProps) {
  const [formData, setFormData] = useState<ActivityFormData>(() => ({
    ...initialFormData,
    date: preselectedDate ? preselectedDate.toISOString().split('T')[0] : '',
  }));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleChange = useCallback((
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError(null);
  }, []);

  const handleCategorySelect = useCallback((category: ActivityCategory) => {
    setFormData(prev => ({ ...prev, category }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      setError('Activity name is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        category: formData.category,
      };

      // Add optional fields
      if (formData.date) {
        // API expects date as ISO string that will be transformed to Date
        // Date input gives YYYY-MM-DD format, which Date constructor can parse
        payload.date = formData.date;
      }
      if (formData.startTime && formData.date) {
        // Combine date and time for startTime - format: YYYY-MM-DDTHH:MM
        // This format is parseable by Date constructor
        payload.startTime = `${formData.date}T${formData.startTime}:00`;
      }
      if (formData.endTime && formData.date) {
        // Combine date and time for endTime - format: YYYY-MM-DDTHH:MM
        payload.endTime = `${formData.date}T${formData.endTime}:00`;
      }
      if (formData.cost && formData.cost.trim()) {
        const costValue = parseFloat(formData.cost);
        if (!isNaN(costValue) && costValue >= 0) {
          payload.cost = costValue;
          payload.currency = formData.currency;
        }
      }
      if (formData.location.trim()) {
        payload.location = { address: formData.location.trim() };
      }
      if (formData.bookingUrl.trim()) {
        // API expects bookingUrl at root level, not in externalLinks
        payload.bookingUrl = formData.bookingUrl.trim();
      }

      const response = await fetch(`/api/trips/${tripId}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        console.error('[AddActivityModal] API Error:', {
          status: response.status,
          error: data.error,
          details: data.details,
          payload,
        });
        
        // Show validation errors if available
        if (data.details) {
          const errorMessages = Object.values(data.details.fieldErrors || {}).flat();
          throw new Error(errorMessages.length > 0 ? errorMessages.join(', ') : data.error || 'Failed to add activity');
        }
        throw new Error(data.error || `Failed to add activity (${response.status})`);
      }

      // Reset form and close modal
      setFormData(initialFormData);
      onActivityAdded?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add activity');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = useCallback(() => {
    if (!isSubmitting) {
      setFormData(initialFormData);
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

          {/* Modal - Draggable with high z-index for visibility */}
          <FocusTrap active onEscape={handleClose}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-activity-title"
              initial={{ opacity: 0, scale: 0.95, x: 0, y: 0 }}
              animate={{ 
                opacity: 1, 
                scale: 1,
                x: position.x,
                y: position.y,
              }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              drag
              dragMomentum={false}
              dragElastic={0}
              onDrag={(_, info) => {
                // Constrain dragging to viewport bounds
                const maxX = typeof window !== 'undefined' ? window.innerWidth / 2 - 200 : 0;
                const maxY = typeof window !== 'undefined' ? window.innerHeight / 2 - 100 : 0;
                setPosition({ 
                  x: Math.max(-maxX, Math.min(maxX, info.offset.x)), 
                  y: Math.max(-maxY, Math.min(maxY, info.offset.y))
                });
              }}
              className="fixed left-1/2 top-1/2 z-[9999] w-full max-w-lg mx-4 max-h-[90vh] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header - Drag Handle */}
              <div 
                className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-700 cursor-move select-none"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                    </svg>
                    <h2 id="add-activity-title" className="text-xl font-semibold text-slate-900 dark:text-white">
                      Add Activity
                    </h2>
                  </div>
                  <button
                    onClick={handleClose}
                    className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    aria-label="Close"
                    disabled={isSubmitting}
                  >
                    <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Scrollable Form Content */}
              <div className="flex-1 overflow-y-auto">
                <form onSubmit={handleSubmit} id="add-activity-form" className="p-6 space-y-5">
                {/* Activity Name */}
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Activity Name *
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="e.g., Visit the Eiffel Tower"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                    required
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Category
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {ACTIVITY_CATEGORIES.map((cat) => (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => handleCategorySelect(cat.value)}
                        className={`flex flex-col items-center p-2 rounded-lg border-2 transition-all ${
                          formData.category === cat.value
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30'
                            : 'border-slate-200 dark:border-slate-600 hover:border-emerald-300'
                        }`}
                        title={cat.label}
                      >
                        <span className="text-xl">{cat.icon}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate w-full text-center">
                          {cat.label.split(' ')[0]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    placeholder="What's this activity about?"
                    rows={3}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all resize-none"
                  />
                </div>

                {/* Date and Time Row */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="date" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Date
                    </label>
                    <input
                      id="date"
                      name="date"
                      type="date"
                      value={formData.date}
                      onChange={handleChange}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="startTime" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Start Time
                    </label>
                    <input
                      id="startTime"
                      name="startTime"
                      type="time"
                      value={formData.startTime}
                      onChange={handleChange}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="endTime" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      End Time
                    </label>
                    <input
                      id="endTime"
                      name="endTime"
                      type="time"
                      value={formData.endTime}
                      onChange={handleChange}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all text-sm"
                    />
                  </div>
                </div>

                {/* Cost */}
                <div>
                  <label htmlFor="cost" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Cost (optional)
                  </label>
                  <div className="flex gap-2">
                    <select
                      id="currency"
                      name="currency"
                      value={formData.currency}
                      onChange={handleChange}
                      className="w-24 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:border-emerald-500 outline-none transition-all text-sm"
                    >
                      {currencies.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.symbol} {c.code}
                        </option>
                      ))}
                    </select>
                    <input
                      id="cost"
                      name="cost"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.cost}
                      onChange={handleChange}
                      placeholder="0.00"
                      className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Location */}
                <div>
                  <label htmlFor="location" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Location
                  </label>
                  <input
                    id="location"
                    name="location"
                    type="text"
                    value={formData.location}
                    onChange={handleChange}
                    placeholder="Address or place name"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                  />
                </div>

                {/* Booking URL */}
                <div>
                  <label htmlFor="bookingUrl" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Booking URL
                  </label>
                  <input
                    id="bookingUrl"
                    name="bookingUrl"
                    type="url"
                    value={formData.bookingUrl}
                    onChange={handleChange}
                    placeholder="https://..."
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                  />
                </div>

                {/* Error Message */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm"
                  >
                    {error}
                  </motion.div>
                )}

                </form>
              </div>

              {/* Sticky Footer with Actions */}
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
                    form="add-activity-form"
                    disabled={isSubmitting || !formData.name.trim()}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Adding...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Activity
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

export default AddActivityModal;
