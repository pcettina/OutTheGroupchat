/**
 * Shared types for the TripChat component system.
 */

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  actions?: SuggestedAction[];
  error?: boolean;
}

export interface SuggestedAction {
  type: 'add_activity' | 'invite_member' | 'start_survey' | 'view_destination' | 'view_itinerary';
  label: string;
  payload?: Record<string, unknown>;
}

export interface TripContext {
  tripId: string;
  tripTitle: string;
  destination: string;
  startDate: string;
  endDate: string;
  memberCount: number;
  budget?: number;
}

export interface TripChatProps {
  tripContext?: TripContext;
  onAction?: (action: SuggestedAction) => void;
  className?: string;
}
