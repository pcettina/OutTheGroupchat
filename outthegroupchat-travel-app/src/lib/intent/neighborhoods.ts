/**
 * @module intent/neighborhoods
 * @description App-side re-export of the NYC neighborhood taxonomy. The source
 * of truth lives in `prisma/seed/generators/neighborhoods-nyc.ts` because it
 * doubles as seed data; this thin re-export gives the UI an `@/lib/...`
 * import path without crossing into the prisma/seed directory.
 */

export {
  type Neighborhood,
  type NeighborhoodSlug,
  NYC_NEIGHBORHOODS,
  isNeighborhoodSlug,
} from '../../../prisma/seed/generators/neighborhoods-nyc';
