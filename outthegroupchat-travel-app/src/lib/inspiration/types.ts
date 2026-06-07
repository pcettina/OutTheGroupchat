import { z } from 'zod';

export const searchSchema = z.object({
  query: z.string().optional(),
  destination: z.string().optional(),
  tripType: z
    .enum([
      'bachelor',
      'bachelorette',
      'girls-trip',
      'adventure',
      'relaxation',
      'cultural',
      'food',
      'nightlife',
    ])
    .optional(),
  budgetMin: z.coerce.number().min(0).optional(),
  budgetMax: z.coerce.number().min(0).optional(),
  groupSizeMin: z.coerce.number().min(1).optional(),
  groupSizeMax: z.coerce.number().min(1).optional(),
  duration: z.enum(['weekend', 'short', 'week', 'long']).optional(),
  sortBy: z
    .enum(['popular', 'recent', 'rating', 'budget-low', 'budget-high'])
    .default('popular'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export const inspirationPostSchema = z.object({
  templateId: z.string().min(1, 'templateId is required'),
  action: z.enum(['get-template'], { message: 'action must be get-template' }),
});

export type SearchInput = z.infer<typeof searchSchema>;
export type InspirationPostInput = z.infer<typeof inspirationPostSchema>;

export interface TripTemplate {
  id: string;
  title: string;
  description: string;
  destination: { city: string; country: string };
  duration: number;
  estimatedBudget: { min: number; max: number; currency: string };
  tags: string[];
  highlights: string[];
  image: string;
  rating: number;
  usageCount: number;
}

export interface PopularDestination {
  city: string;
  country: string;
  tripCount: number;
  topType: string;
}
