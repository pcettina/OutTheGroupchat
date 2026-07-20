/**
 * @module heatmap/anonymous-floor
 * @description The R14 k-anonymity floor, isolated in a dependency-free module
 * so both server code (Prisma-backed aggregation / probing) and client code
 * (the privacy picker) can import the same number without the client bundle
 * pulling in `@/lib/prisma`.
 */

/**
 * A cell's ANONYMOUS bucket must hold at least this many live contributions
 * before any of them surface on the heatmap. Contributions below the floor are
 * suppressed entirely by the read-side aggregator.
 */
export const ANONYMOUS_FLOOR = 3;
