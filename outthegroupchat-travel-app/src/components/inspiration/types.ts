export interface Template {
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

export interface Destination {
  city: string;
  country: string;
  tripCount: number;
  topType: string;
}

export interface TrendingActivity {
  id: string;
  name: string;
  description: string;
  category: string;
  destination: string;
  avgRating: number | null;
  saveCount: number;
  commentCount: number;
}

export interface TripType {
  value: string;
  label: string;
  emoji: string;
}

export const tripTypes: TripType[] = [
  { value: 'bachelor', label: 'Bachelor Party', emoji: '🎉' },
  { value: 'bachelorette', label: 'Bachelorette', emoji: '👰' },
  { value: 'girls-trip', label: 'Girls Trip', emoji: '💅' },
  { value: 'adventure', label: 'Adventure', emoji: '🏔️' },
  { value: 'relaxation', label: 'Relaxation', emoji: '🧘' },
  { value: 'cultural', label: 'Cultural', emoji: '🎭' },
  { value: 'food', label: 'Food & Drink', emoji: '🍽️' },
  { value: 'nightlife', label: 'Nightlife', emoji: '🌙' },
];
