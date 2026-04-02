'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { z } from 'zod';
import { logError } from '@/lib/logger';
import type { TripWithRelations, Destination } from '@/types';

// Client-side Zod validation schema
const editTripSchema = z.object({
  title: z.string().min(1, 'Trip name is required').max(100, 'Trip name must be under 100 characters'),
  description: z.string().max(500, 'Description must be under 500 characters').optional(),
  destinationCity: z.string().min(1, 'City is required'),
  destinationCountry: z.string().min(1, 'Country is required'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  isPublic: z.boolean(),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return new Date(data.endDate) >= new Date(data.startDate);
    }
    return true;
  },
  { message: 'End date must be on or after start date', path: ['endDate'] }
);

type EditTripFormData = z.infer<typeof editTripSchema>;
type FieldErrors = Partial<Record<keyof EditTripFormData, string>>;

interface EditTripModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: TripWithRelations;
  onSuccess: () => void;
}

function toDateInputValue(dateVal: Date | string): string {
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

export function EditTripModal({ isOpen, onClose, trip, onSuccess }: EditTripModalProps) {
  const destination = trip.destination as unknown as Destination | null;

  const [formData, setFormData] = useState<EditTripFormData>({
    title: trip.title,
    description: trip.description ?? '',
    destinationCity: destination?.city ?? '',
    destinationCountry: destination?.country ?? '',
    startDate: toDateInputValue(trip.startDate),
    endDate: toDateInputValue(trip.endDate),
    isPublic: trip.isPublic,
  });

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Re-sync form when trip prop changes or modal opens
  useEffect(() => {
    if (isOpen) {
      const dest = trip.destination as unknown as Destination | null;
      setFormData({
        title: trip.title,
        description: trip.description ?? '',
        destinationCity: dest?.city ?? '',
        destinationCountry: dest?.country ?? '',
        startDate: toDateInputValue(trip.startDate),
        endDate: toDateInputValue(trip.endDate),
        isPublic: trip.isPublic,
      });
      setFieldErrors({});
      setApiError(null);
    }
  }, [isOpen, trip]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    setApiError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation
    const parseResult = editTripSchema.safeParse(formData);
    if (!parseResult.success) {
      const errors: FieldErrors = {};
      for (const issue of parseResult.error.issues) {
        const field = issue.path[0] as keyof EditTripFormData;
        if (!errors[field]) errors[field] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setIsSaving(true);
    setApiError(null);

    try {
      const payload: Record<string, unknown> = {
        title: parseResult.data.title,
        isPublic: parseResult.data.isPublic,
        startDate: parseResult.data.startDate,
        endDate: parseResult.data.endDate,
        destination: {
          city: parseResult.data.destinationCity,
          country: parseResult.data.destinationCountry,
          ...(destination?.coordinates && { coordinates: destination.coordinates }),
          ...(destination?.timezone && { timezone: destination.timezone }),
        },
      };

      if (parseResult.data.description) {
        payload.description = parseResult.data.description;
      }

      const response = await fetch(`/api/trips/${trip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed to update trip (${response.status})`);
      }

      onSuccess();
      onClose();
    } catch (err) {
      logError('EditTripModal.handleSubmit', err);
      setApiError(err instanceof Error ? err.message : 'Failed to update trip');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (!isSaving) {
      onClose();
    }
  };

  const inputCls =
    'w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all text-slate-900 dark:text-white placeholder-slate-400';
  const errorCls = 'mt-1 text-xs text-red-500 dark:text-red-400';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Modal */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-trip-title"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[51] max-w-lg mx-auto max-h-[90vh] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <h2 id="edit-trip-title" className="text-lg font-semibold text-slate-900 dark:text-white">
                  Edit Trip
                </h2>
              </div>
              <button
                onClick={handleClose}
                disabled={isSaving}
                aria-label="Close"
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable Form */}
            <div className="flex-1 overflow-y-auto">
              <form onSubmit={handleSubmit} id="edit-trip-form" className="p-6 space-y-5">
                {/* Trip Name */}
                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Trip Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="title"
                    name="title"
                    type="text"
                    value={formData.title}
                    onChange={handleChange}
                    placeholder="e.g., Summer in Paris"
                    className={inputCls}
                    disabled={isSaving}
                  />
                  {fieldErrors.title && <p className={errorCls}>{fieldErrors.title}</p>}
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
                    placeholder="What's this trip about?"
                    rows={3}
                    className={`${inputCls} resize-none`}
                    disabled={isSaving}
                  />
                  {fieldErrors.description && <p className={errorCls}>{fieldErrors.description}</p>}
                </div>

                {/* Destination */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="destinationCity" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      City <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="destinationCity"
                      name="destinationCity"
                      type="text"
                      value={formData.destinationCity}
                      onChange={handleChange}
                      placeholder="Paris"
                      className={inputCls}
                      disabled={isSaving}
                    />
                    {fieldErrors.destinationCity && <p className={errorCls}>{fieldErrors.destinationCity}</p>}
                  </div>
                  <div>
                    <label htmlFor="destinationCountry" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Country <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="destinationCountry"
                      name="destinationCountry"
                      type="text"
                      value={formData.destinationCountry}
                      onChange={handleChange}
                      placeholder="France"
                      className={inputCls}
                      disabled={isSaving}
                    />
                    {fieldErrors.destinationCountry && <p className={errorCls}>{fieldErrors.destinationCountry}</p>}
                  </div>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="startDate" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Start Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="startDate"
                      name="startDate"
                      type="date"
                      value={formData.startDate}
                      onChange={handleChange}
                      className={inputCls}
                      disabled={isSaving}
                    />
                    {fieldErrors.startDate && <p className={errorCls}>{fieldErrors.startDate}</p>}
                  </div>
                  <div>
                    <label htmlFor="endDate" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      End Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="endDate"
                      name="endDate"
                      type="date"
                      value={formData.endDate}
                      onChange={handleChange}
                      className={inputCls}
                      disabled={isSaving}
                    />
                    {fieldErrors.endDate && <p className={errorCls}>{fieldErrors.endDate}</p>}
                  </div>
                </div>

                {/* Visibility */}
                <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                  <input
                    id="isPublic"
                    name="isPublic"
                    type="checkbox"
                    checked={formData.isPublic}
                    onChange={handleChange}
                    disabled={isSaving}
                    className="w-4 h-4 text-emerald-500 border-slate-300 rounded focus:ring-emerald-500"
                  />
                  <div>
                    <label htmlFor="isPublic" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                      Make trip public
                    </label>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Public trips can be discovered and viewed by anyone
                    </p>
                  </div>
                </div>

                {/* API Error */}
                {apiError && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm"
                  >
                    {apiError}
                  </motion.div>
                )}
              </form>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 flex gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-b-2xl">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSaving}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="edit-trip-form"
                disabled={isSaving}
                className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default EditTripModal;
