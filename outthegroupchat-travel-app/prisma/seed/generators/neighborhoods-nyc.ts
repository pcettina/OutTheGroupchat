/**
 * NYC neighborhoods (R16) — the curated `cityArea` dropdown for v1.
 *
 * Stored as a const-export rather than a DB table because cityAreas are
 * referenced by `Intent.cityArea` as a string slug; persisting them in a
 * separate table would force unnecessary joins. v1.5 with multi-city support
 * will likely promote this to a DB-backed table.
 *
 * Slugs are stable identifiers (do not rename); displayName can evolve.
 *
 * `centroidLat` / `centroidLng` are approximate neighborhood centers used by
 * the Phase 4 heatmap as the fallback contribution cell when an Intent has a
 * `cityArea` but no `venueId`. Coordinates are intentionally low-precision
 * (~3 decimal places, ~110m at NYC latitudes) since the BLOCK granularity
 * mode in `cell-anonymize.ts` rounds to 3 decimals anyway.
 */
export type NeighborhoodSlug =
  | 'east-village'
  | 'lower-east-side'
  | 'west-village'
  | 'greenwich-village'
  | 'soho'
  | 'tribeca'
  | 'chinatown'
  | 'nolita'
  | 'noho'
  | 'flatiron'
  | 'gramercy'
  | 'union-square'
  | 'chelsea'
  | 'midtown-east'
  | 'midtown-west'
  | 'hells-kitchen'
  | 'upper-east-side'
  | 'upper-west-side'
  | 'harlem'
  | 'washington-heights'
  | 'williamsburg'
  | 'bushwick'
  | 'greenpoint'
  | 'bedford-stuyvesant'
  | 'park-slope'
  | 'fort-greene'
  | 'crown-heights'
  | 'dumbo'
  | 'long-island-city'
  | 'astoria';

export interface Neighborhood {
  slug: NeighborhoodSlug;
  displayName: string;
  borough: 'Manhattan' | 'Brooklyn' | 'Queens';
  centroidLat: number;
  centroidLng: number;
}

export const NYC_NEIGHBORHOODS: ReadonlyArray<Neighborhood> = [
  { slug: 'east-village', displayName: 'East Village', borough: 'Manhattan', centroidLat: 40.728, centroidLng: -73.984 },
  { slug: 'lower-east-side', displayName: 'Lower East Side', borough: 'Manhattan', centroidLat: 40.715, centroidLng: -73.985 },
  { slug: 'west-village', displayName: 'West Village', borough: 'Manhattan', centroidLat: 40.735, centroidLng: -74.004 },
  { slug: 'greenwich-village', displayName: 'Greenwich Village', borough: 'Manhattan', centroidLat: 40.733, centroidLng: -73.999 },
  { slug: 'soho', displayName: 'SoHo', borough: 'Manhattan', centroidLat: 40.723, centroidLng: -74.003 },
  { slug: 'tribeca', displayName: 'Tribeca', borough: 'Manhattan', centroidLat: 40.719, centroidLng: -74.009 },
  { slug: 'chinatown', displayName: 'Chinatown', borough: 'Manhattan', centroidLat: 40.716, centroidLng: -73.997 },
  { slug: 'nolita', displayName: 'NoLIta', borough: 'Manhattan', centroidLat: 40.722, centroidLng: -73.996 },
  { slug: 'noho', displayName: 'NoHo', borough: 'Manhattan', centroidLat: 40.728, centroidLng: -73.992 },
  { slug: 'flatiron', displayName: 'Flatiron', borough: 'Manhattan', centroidLat: 40.740, centroidLng: -73.990 },
  { slug: 'gramercy', displayName: 'Gramercy', borough: 'Manhattan', centroidLat: 40.737, centroidLng: -73.985 },
  { slug: 'union-square', displayName: 'Union Square', borough: 'Manhattan', centroidLat: 40.736, centroidLng: -73.991 },
  { slug: 'chelsea', displayName: 'Chelsea', borough: 'Manhattan', centroidLat: 40.747, centroidLng: -74.001 },
  { slug: 'midtown-east', displayName: 'Midtown East', borough: 'Manhattan', centroidLat: 40.755, centroidLng: -73.976 },
  { slug: 'midtown-west', displayName: 'Midtown West', borough: 'Manhattan', centroidLat: 40.759, centroidLng: -73.985 },
  { slug: 'hells-kitchen', displayName: 'Hell’s Kitchen', borough: 'Manhattan', centroidLat: 40.764, centroidLng: -73.992 },
  { slug: 'upper-east-side', displayName: 'Upper East Side', borough: 'Manhattan', centroidLat: 40.774, centroidLng: -73.957 },
  { slug: 'upper-west-side', displayName: 'Upper West Side', borough: 'Manhattan', centroidLat: 40.787, centroidLng: -73.975 },
  { slug: 'harlem', displayName: 'Harlem', borough: 'Manhattan', centroidLat: 40.812, centroidLng: -73.946 },
  { slug: 'washington-heights', displayName: 'Washington Heights', borough: 'Manhattan', centroidLat: 40.842, centroidLng: -73.939 },
  { slug: 'williamsburg', displayName: 'Williamsburg', borough: 'Brooklyn', centroidLat: 40.708, centroidLng: -73.957 },
  { slug: 'bushwick', displayName: 'Bushwick', borough: 'Brooklyn', centroidLat: 40.694, centroidLng: -73.921 },
  { slug: 'greenpoint', displayName: 'Greenpoint', borough: 'Brooklyn', centroidLat: 40.725, centroidLng: -73.951 },
  { slug: 'bedford-stuyvesant', displayName: 'Bedford-Stuyvesant', borough: 'Brooklyn', centroidLat: 40.687, centroidLng: -73.942 },
  { slug: 'park-slope', displayName: 'Park Slope', borough: 'Brooklyn', centroidLat: 40.671, centroidLng: -73.981 },
  { slug: 'fort-greene', displayName: 'Fort Greene', borough: 'Brooklyn', centroidLat: 40.688, centroidLng: -73.974 },
  { slug: 'crown-heights', displayName: 'Crown Heights', borough: 'Brooklyn', centroidLat: 40.669, centroidLng: -73.944 },
  { slug: 'dumbo', displayName: 'Dumbo', borough: 'Brooklyn', centroidLat: 40.703, centroidLng: -73.989 },
  { slug: 'long-island-city', displayName: 'Long Island City', borough: 'Queens', centroidLat: 40.745, centroidLng: -73.949 },
  { slug: 'astoria', displayName: 'Astoria', borough: 'Queens', centroidLat: 40.764, centroidLng: -73.924 },
];

const NEIGHBORHOOD_SLUG_SET: ReadonlySet<string> = new Set(
  NYC_NEIGHBORHOODS.map((n) => n.slug),
);

export function isNeighborhoodSlug(value: string): value is NeighborhoodSlug {
  return NEIGHBORHOOD_SLUG_SET.has(value);
}

const NEIGHBORHOOD_BY_SLUG: ReadonlyMap<NeighborhoodSlug, Neighborhood> = new Map(
  NYC_NEIGHBORHOODS.map((n) => [n.slug, n] as const),
);

/**
 * Returns the neighborhood centroid as a `{ lat, lng }` pair, or `null` when
 * the slug is unknown. Used by the heatmap contribution writer when an Intent
 * has a `cityArea` but no `venueId` — the centroid stands in for the missing
 * precise coordinate so the contribution still renders.
 */
export function getNeighborhoodCentroid(
  slug: string,
): { lat: number; lng: number } | null {
  if (!isNeighborhoodSlug(slug)) return null;
  const n = NEIGHBORHOOD_BY_SLUG.get(slug);
  if (!n) return null;
  return { lat: n.centroidLat, lng: n.centroidLng };
}
