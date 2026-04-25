/**
 * NYC neighborhoods (R16) — the curated `cityArea` dropdown for v1.
 *
 * Stored as a const-export rather than a DB table because cityAreas are
 * referenced by `Intent.cityArea` as a string slug; persisting them in a
 * separate table would force unnecessary joins. v1.5 with multi-city support
 * will likely promote this to a DB-backed table.
 *
 * Slugs are stable identifiers (do not rename); displayName can evolve.
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
}

export const NYC_NEIGHBORHOODS: ReadonlyArray<Neighborhood> = [
  { slug: 'east-village', displayName: 'East Village', borough: 'Manhattan' },
  { slug: 'lower-east-side', displayName: 'Lower East Side', borough: 'Manhattan' },
  { slug: 'west-village', displayName: 'West Village', borough: 'Manhattan' },
  { slug: 'greenwich-village', displayName: 'Greenwich Village', borough: 'Manhattan' },
  { slug: 'soho', displayName: 'SoHo', borough: 'Manhattan' },
  { slug: 'tribeca', displayName: 'Tribeca', borough: 'Manhattan' },
  { slug: 'chinatown', displayName: 'Chinatown', borough: 'Manhattan' },
  { slug: 'nolita', displayName: 'NoLIta', borough: 'Manhattan' },
  { slug: 'noho', displayName: 'NoHo', borough: 'Manhattan' },
  { slug: 'flatiron', displayName: 'Flatiron', borough: 'Manhattan' },
  { slug: 'gramercy', displayName: 'Gramercy', borough: 'Manhattan' },
  { slug: 'union-square', displayName: 'Union Square', borough: 'Manhattan' },
  { slug: 'chelsea', displayName: 'Chelsea', borough: 'Manhattan' },
  { slug: 'midtown-east', displayName: 'Midtown East', borough: 'Manhattan' },
  { slug: 'midtown-west', displayName: 'Midtown West', borough: 'Manhattan' },
  { slug: 'hells-kitchen', displayName: 'Hell\u2019s Kitchen', borough: 'Manhattan' },
  { slug: 'upper-east-side', displayName: 'Upper East Side', borough: 'Manhattan' },
  { slug: 'upper-west-side', displayName: 'Upper West Side', borough: 'Manhattan' },
  { slug: 'harlem', displayName: 'Harlem', borough: 'Manhattan' },
  { slug: 'washington-heights', displayName: 'Washington Heights', borough: 'Manhattan' },
  { slug: 'williamsburg', displayName: 'Williamsburg', borough: 'Brooklyn' },
  { slug: 'bushwick', displayName: 'Bushwick', borough: 'Brooklyn' },
  { slug: 'greenpoint', displayName: 'Greenpoint', borough: 'Brooklyn' },
  { slug: 'bedford-stuyvesant', displayName: 'Bedford-Stuyvesant', borough: 'Brooklyn' },
  { slug: 'park-slope', displayName: 'Park Slope', borough: 'Brooklyn' },
  { slug: 'fort-greene', displayName: 'Fort Greene', borough: 'Brooklyn' },
  { slug: 'crown-heights', displayName: 'Crown Heights', borough: 'Brooklyn' },
  { slug: 'dumbo', displayName: 'Dumbo', borough: 'Brooklyn' },
  { slug: 'long-island-city', displayName: 'Long Island City', borough: 'Queens' },
  { slug: 'astoria', displayName: 'Astoria', borough: 'Queens' },
];

const NEIGHBORHOOD_SLUGS = new Set<string>(NYC_NEIGHBORHOODS.map((n) => n.slug));

/** Validate that a string is a known NYC neighborhood slug. */
export function isNeighborhoodSlug(value: string): value is NeighborhoodSlug {
  return NEIGHBORHOOD_SLUGS.has(value);
}
