/**
 * @module heatmap/anchor-select
 * @description V1 Phase 4b — picks which mutual-Crew anchor name attaches to
 * a FoF contribution per R24's priority hierarchy.
 *
 * Priority hierarchy (from R24):
 *   1. Mutual Crew member who is in the current SubCrew (event-context).
 *   2. Most-recently-interacted-with mutual Crew member (last 90 days).
 *   3. Most-recent Crew-edge creation (i.e. the freshest Crew connection).
 *   4. Alphabetical (final tiebreaker).
 *
 * v1 scope: priorities 1, 3, 4 ship. Priority 2 is deferred — it requires
 * joining DM, CheckIn, and RSVP tables which adds query cost and isn't
 * critical for v1 correctness. The R24 follow-up sub-question (event-context
 * detection) lands here as: priority 1 fires when the caller passes
 * `subCrewMemberIds` (typically resolved from `?subCrewId=` on the route);
 * absent that, the rule falls back through 3 → 4.
 */

export interface AnchorPick {
  anchorUserId: string;
  anchorName: string | null;
}

export interface PickAnchorInput {
  /** Anchor candidate ids — the FoF user's mutual-Crew with the viewer. */
  anchorIds: string[];
  /** Anchors that are members of the active SubCrew context (R24 priority 1).
   *  Pass an empty Set when there is no event context. */
  subCrewMemberAnchorIds: Set<string>;
  /** anchorId → Crew.createdAt with the viewer (R24 priority 3). */
  crewEdgeCreatedByAnchor: Map<string, Date>;
  /** anchorId → display name. Used both as final-tiebreaker key and for the
   *  anchorName returned to the UI. */
  anchorNameById: Map<string, string | null>;
}

export function pickAnchor(input: PickAnchorInput): AnchorPick | null {
  if (input.anchorIds.length === 0) return null;

  // Priority 1 — anchor in the active SubCrew. Iterates in caller's order
  // so the first match (typically the seed) wins when multiple SubCrew
  // members are also anchors.
  for (const aid of input.anchorIds) {
    if (input.subCrewMemberAnchorIds.has(aid)) {
      return {
        anchorUserId: aid,
        anchorName: input.anchorNameById.get(aid) ?? null,
      };
    }
  }

  // Priority 3 — most-recent Crew edge with the viewer.
  let recentBest: { id: string; ts: Date } | null = null;
  for (const aid of input.anchorIds) {
    const ts = input.crewEdgeCreatedByAnchor.get(aid);
    if (!ts) continue;
    if (!recentBest || ts.getTime() > recentBest.ts.getTime()) {
      recentBest = { id: aid, ts };
    }
  }
  if (recentBest) {
    return {
      anchorUserId: recentBest.id,
      anchorName: input.anchorNameById.get(recentBest.id) ?? null,
    };
  }

  // Priority 4 — alphabetical by name (or id if name missing).
  const sorted = [...input.anchorIds].sort((a, b) => {
    const an = input.anchorNameById.get(a) ?? a;
    const bn = input.anchorNameById.get(b) ?? b;
    return an.localeCompare(bn);
  });
  return {
    anchorUserId: sorted[0],
    anchorName: input.anchorNameById.get(sorted[0]) ?? null,
  };
}

/** Build a "via Alex, Jamie + 2 more" summary string from an ordered list of
 *  anchor names. Empty input returns null so the UI can branch. */
export function buildAnchorSummary(names: ReadonlyArray<string | null>, max = 2): string | null {
  const cleaned = names.filter((n): n is string => Boolean(n));
  if (cleaned.length === 0) return null;
  const head = cleaned.slice(0, max);
  const remaining = cleaned.length - head.length;
  const prefix = `via ${head.join(', ')}`;
  if (remaining > 0) return `${prefix} + ${remaining} more`;
  return prefix;
}
