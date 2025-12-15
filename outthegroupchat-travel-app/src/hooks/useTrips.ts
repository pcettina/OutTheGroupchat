'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TripWithRelations } from '@/types';
import type { Trip } from '@prisma/client';

// API functions
async function fetchTrips(): Promise<TripWithRelations[]> {
  const res = await fetch('/api/trips');
  if (!res.ok) throw new Error('Failed to fetch trips');
  const data = await res.json();
  return data.data || [];
}

async function fetchTrip(tripId: string): Promise<TripWithRelations> {
  const res = await fetch(`/api/trips/${tripId}`);
  if (!res.ok) throw new Error('Failed to fetch trip');
  const data = await res.json();
  return data.data;
}

async function createTrip(tripData: Partial<Trip>): Promise<TripWithRelations> {
  const res = await fetch('/api/trips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tripData),
  });
  if (!res.ok) throw new Error('Failed to create trip');
  const data = await res.json();
  return data.data;
}

async function updateTrip({ tripId, ...updates }: { tripId: string } & Partial<Trip>): Promise<TripWithRelations> {
  const res = await fetch(`/api/trips/${tripId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update trip');
  const data = await res.json();
  return data.data;
}

async function deleteTrip(tripId: string): Promise<void> {
  const res = await fetch(`/api/trips/${tripId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete trip');
}

// Hooks
export function useTrips() {
  return useQuery({
    queryKey: ['trips'],
    queryFn: fetchTrips,
  });
}

export function useTrip(tripId: string) {
  return useQuery({
    queryKey: ['trip', tripId],
    queryFn: () => fetchTrip(tripId),
    enabled: !!tripId,
  });
}

export function useCreateTrip() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: createTrip,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    },
  });
}

export function useUpdateTrip() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: updateTrip,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      queryClient.invalidateQueries({ queryKey: ['trip', data.id] });
    },
  });
}

export function useDeleteTrip() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: deleteTrip,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    },
  });
}

