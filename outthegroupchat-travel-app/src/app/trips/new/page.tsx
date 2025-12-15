'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateTrip } from '@/hooks/useTrips';

const tripSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().optional(),
  destination: z.object({
    city: z.string().min(2, 'City is required'),
    country: z.string().min(2, 'Country is required'),
  }),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  budget: z.object({
    total: z.number().min(0).optional(),
    currency: z.string().default('USD'),
  }).optional(),
  isPublic: z.boolean().default(false),
});

type TripFormData = z.infer<typeof tripSchema>;

const steps = [
  { id: 'basics', title: 'Trip Basics', description: 'Name your adventure' },
  { id: 'destination', title: 'Destination', description: 'Where are you going?' },
  { id: 'dates', title: 'Dates', description: 'When are you traveling?' },
  { id: 'details', title: 'Details', description: 'Final touches' },
];

export default function NewTripPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const createTrip = useCreateTrip();

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    trigger,
  } = useForm<TripFormData>({
    resolver: zodResolver(tripSchema),
    defaultValues: {
      destination: { city: '', country: '' },
      budget: { currency: 'USD' },
      isPublic: false,
    },
  });

  const watchedValues = watch();

  const nextStep = async () => {
    const fieldsToValidate = 
      currentStep === 0 ? ['title'] :
      currentStep === 1 ? ['destination.city', 'destination.country'] :
      currentStep === 2 ? ['startDate', 'endDate'] :
      [];

    const isValid = await trigger(fieldsToValidate as any);
    if (isValid && currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const onSubmit = async (data: TripFormData) => {
    try {
      const trip = await createTrip.mutateAsync({
        title: data.title,
        description: data.description,
        destination: data.destination,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        budget: data.budget?.total ? data.budget : undefined,
        isPublic: data.isPublic,
      } as any);
      
      router.push(`/trips/${trip.id}`);
    } catch (error) {
      console.error('Failed to create trip:', error);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex justify-between mb-2">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`flex items-center ${index < steps.length - 1 ? 'flex-1' : ''}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  index <= currentStep
                    ? 'bg-primary text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {index + 1}
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`flex-1 h-1 mx-2 transition-colors ${
                    index < currentStep ? 'bg-primary' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900">{steps[currentStep].title}</h2>
          <p className="text-gray-500">{steps[currentStep].description}</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <AnimatePresence mode="wait">
            {/* Step 1: Basics */}
            {currentStep === 0 && (
              <motion.div
                key="basics"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Trip Name *
                  </label>
                  <input
                    {...register('title')}
                    type="text"
                    placeholder="Nashville Summer Adventure"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  />
                  {errors.title && (
                    <p className="text-red-500 text-sm mt-1">{errors.title.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description (optional)
                  </label>
                  <textarea
                    {...register('description')}
                    placeholder="A weekend getaway with the crew..."
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none"
                  />
                </div>
              </motion.div>
            )}

            {/* Step 2: Destination */}
            {currentStep === 1 && (
              <motion.div
                key="destination"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City *
                  </label>
                  <input
                    {...register('destination.city')}
                    type="text"
                    placeholder="Nashville"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  />
                  {errors.destination?.city && (
                    <p className="text-red-500 text-sm mt-1">{errors.destination.city.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Country *
                  </label>
                  <input
                    {...register('destination.country')}
                    type="text"
                    placeholder="USA"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  />
                  {errors.destination?.country && (
                    <p className="text-red-500 text-sm mt-1">{errors.destination.country.message}</p>
                  )}
                </div>
              </motion.div>
            )}

            {/* Step 3: Dates */}
            {currentStep === 2 && (
              <motion.div
                key="dates"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date *
                  </label>
                  <input
                    {...register('startDate')}
                    type="date"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  />
                  {errors.startDate && (
                    <p className="text-red-500 text-sm mt-1">{errors.startDate.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date *
                  </label>
                  <input
                    {...register('endDate')}
                    type="date"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  />
                  {errors.endDate && (
                    <p className="text-red-500 text-sm mt-1">{errors.endDate.message}</p>
                  )}
                </div>
              </motion.div>
            )}

            {/* Step 4: Details */}
            {currentStep === 3 && (
              <motion.div
                key="details"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Budget (optional)
                  </label>
                  <div className="flex gap-2">
                    <select
                      {...register('budget.currency')}
                      className="px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    >
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                    </select>
                    <input
                      {...register('budget.total', { valueAsNumber: true })}
                      type="number"
                      placeholder="2500"
                      className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
                  <input
                    {...register('isPublic')}
                    type="checkbox"
                    id="isPublic"
                    className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <label htmlFor="isPublic" className="flex-1">
                    <span className="font-medium text-gray-900">Make trip public</span>
                    <p className="text-sm text-gray-500">
                      Anyone can see this trip and its activities
                    </p>
                  </label>
                </div>

                {/* Summary */}
                <div className="mt-6 p-4 bg-primary/5 rounded-xl border border-primary/20">
                  <h3 className="font-medium text-gray-900 mb-2">Trip Summary</h3>
                  <div className="space-y-1 text-sm text-gray-600">
                    <p><strong>Name:</strong> {watchedValues.title || 'Not set'}</p>
                    <p><strong>Destination:</strong> {watchedValues.destination?.city}, {watchedValues.destination?.country}</p>
                    <p><strong>Dates:</strong> {watchedValues.startDate} to {watchedValues.endDate}</p>
                    {watchedValues.budget?.total && (
                      <p><strong>Budget:</strong> {watchedValues.budget.currency} {watchedValues.budget.total}</p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="flex gap-3">
          {currentStep > 0 && (
            <button
              type="button"
              onClick={prevStep}
              className="flex-1 px-6 py-3 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
          )}
          {currentStep < steps.length - 1 ? (
            <button
              type="button"
              onClick={nextStep}
              className="flex-1 px-6 py-3 bg-primary text-white font-medium rounded-xl hover:bg-primary/90 transition-colors"
            >
              Continue
            </button>
          ) : (
            <button
              type="submit"
              disabled={createTrip.isPending}
              className="flex-1 px-6 py-3 bg-primary text-white font-medium rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createTrip.isPending ? 'Creating...' : 'Create Trip'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
