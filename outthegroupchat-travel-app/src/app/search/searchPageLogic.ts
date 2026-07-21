/**
 * Pure helpers for the /search page.
 *
 * Everything here is framework-free and side-effect free so it can be unit
 * tested directly (vitest only collects `*.test.ts`, never `.test.tsx`).
 */

/** Result-type filter accepted by `GET /api/search` (`type` query param). */
export type SearchType = 'all' | 'people' | 'meetups' | 'venues';

/** Ordered list of selectable filters, people-first. */
export const SEARCH_TYPES: readonly SearchType[] = ['all', 'people', 'meetups', 'venues'];

export const SEARCH_TYPE_LABELS: Record<SearchType, string> = {
  all: 'Everything',
  people: 'People',
  meetups: 'Meetups',
  venues: 'Venues',
};

/** The API returns an empty payload below this length rather than an error. */
export const MIN_QUERY_LENGTH = 2;

/** Default page size requested from the API. */
export const DEFAULT_SEARCH_LIMIT = 10;

export interface SearchUserResult {
  id: string;
  name: string | null;
  image: string | null;
  city: string | null;
  bio: string | null;
  _count: { followers: number; ownedTrips: number };
}

export interface SearchMeetupResult {
  id: string;
  title: string;
  /** Serialized `Date` — ISO 8601 string over the wire. */
  scheduledAt: string;
  venue: { name: string } | null;
}

export interface SearchVenueResult {
  id: string;
  name: string;
  address: string | null;
  city: string;
  category: string;
}

/**
 * `data` payload of a successful `GET /api/search` response. Note the request
 * param value is `people` but the response key is `users`.
 */
export interface SearchApiData {
  users?: SearchUserResult[];
  meetups?: SearchMeetupResult[];
  venues?: SearchVenueResult[];
}

export type SearchResultKind = 'user' | 'meetup' | 'venue';

/** Flattened, render-ready result row. */
export interface SearchResultItem {
  id: string;
  kind: SearchResultKind;
  title: string;
  subtitle: string;
  image: string | null;
}

/** True when the query is too short for the API to return anything. */
export function isQueryTooShort(query: string): boolean {
  return query.trim().length < MIN_QUERY_LENGTH;
}

/**
 * Build the query string (no leading `?`) for `GET /api/search`.
 * The query is trimmed; `limit` is clamped to the API's 1–50 range.
 */
export function buildSearchQueryString(params: {
  q: string;
  type: SearchType;
  limit?: number;
}): string {
  const limit = Math.min(50, Math.max(1, Math.trunc(params.limit ?? DEFAULT_SEARCH_LIMIT)));
  const search = new URLSearchParams({
    q: params.q.trim(),
    type: params.type,
    limit: String(limit),
  });
  return search.toString();
}

/** Full request path for `GET /api/search`. */
export function buildSearchUrl(params: { q: string; type: SearchType; limit?: number }): string {
  return `/api/search?${buildSearchQueryString(params)}`;
}

function formatScheduledAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function userSubtitle(user: SearchUserResult): string {
  const followers = user._count?.followers ?? 0;
  const parts = [user.city, followers === 1 ? '1 Crew' : `${followers} Crew`];
  return parts.filter((part): part is string => Boolean(part)).join(' · ');
}

function meetupSubtitle(meetup: SearchMeetupResult): string {
  return [meetup.venue?.name, formatScheduledAt(meetup.scheduledAt)]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

function venueSubtitle(venue: SearchVenueResult): string {
  return [venue.category, venue.city].filter((part): part is string => Boolean(part)).join(' · ');
}

/**
 * Flatten the `{ users, meetups, venues }` envelope into a single ordered list.
 * Missing keys are treated as empty. Ordering is people-first, then meetups,
 * then venues — matching the API's own ordering intent.
 */
export function flattenSearchResults(data: SearchApiData | null | undefined): SearchResultItem[] {
  if (!data) return [];

  const users = (data.users ?? []).map<SearchResultItem>((user) => ({
    id: user.id,
    kind: 'user',
    title: user.name ?? 'Someone',
    subtitle: userSubtitle(user),
    image: user.image,
  }));

  const meetups = (data.meetups ?? []).map<SearchResultItem>((meetup) => ({
    id: meetup.id,
    kind: 'meetup',
    title: meetup.title,
    subtitle: meetupSubtitle(meetup),
    image: null,
  }));

  const venues = (data.venues ?? []).map<SearchResultItem>((venue) => ({
    id: venue.id,
    kind: 'venue',
    title: venue.name,
    subtitle: venueSubtitle(venue),
    image: null,
  }));

  return [...users, ...meetups, ...venues];
}

/**
 * Href for a result row, or `null` when the kind has no destination route.
 * Venues have no detail page, so venue rows render without a link.
 */
export function searchResultHref(result: Pick<SearchResultItem, 'id' | 'kind'>): string | null {
  switch (result.kind) {
    case 'user':
      return `/profile/${result.id}`;
    case 'meetup':
      return `/meetups/${result.id}`;
    case 'venue':
    default:
      return null;
  }
}

/**
 * Narrow an unknown `GET /api/search` JSON body to its `data` payload.
 * Returns `null` for error envelopes (401/400 bodies carry only `{ error }`).
 */
export function parseSearchResponse(body: unknown): SearchApiData | null {
  if (typeof body !== 'object' || body === null) return null;
  const envelope = body as { success?: unknown; data?: unknown };
  if (envelope.success !== true) return null;
  if (typeof envelope.data !== 'object' || envelope.data === null) return null;
  return envelope.data as SearchApiData;
}
