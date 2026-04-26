/**
 * Unit tests for src/lib/heatmap/anchor-select.ts.
 *
 * Covers the full R24 priority ladder:
 *   - Priority 1 (event-context SubCrew anchor)
 *   - Priority 3 (most-recent Crew edge) — priority 2 is deferred to v1.5
 *   - Priority 4 (alphabetical tiebreaker)
 *
 * Plus the buildAnchorSummary formatter.
 */

import { describe, it, expect } from 'vitest';
import { pickAnchor, buildAnchorSummary } from '@/lib/heatmap/anchor-select';

const empty = new Map<string, Date>();
const noNames = new Map<string, string | null>();

describe('pickAnchor', () => {
  it('returns null when there are no anchors', () => {
    const pick = pickAnchor({
      anchorIds: [],
      subCrewMemberAnchorIds: new Set(),
      crewEdgeCreatedByAnchor: empty,
      anchorNameById: noNames,
    });
    expect(pick).toBeNull();
  });

  it('priority 1 — picks SubCrew-member anchor when in event context', () => {
    const pick = pickAnchor({
      anchorIds: ['a', 'b', 'c'],
      subCrewMemberAnchorIds: new Set(['b']),
      crewEdgeCreatedByAnchor: new Map([
        ['a', new Date('2026-04-25T00:00:00Z')], // most recent
        ['b', new Date('2026-04-01T00:00:00Z')],
        ['c', new Date('2026-04-15T00:00:00Z')],
      ]),
      anchorNameById: new Map([['a', 'Alice'], ['b', 'Bob'], ['c', 'Carol']]),
    });
    expect(pick).toEqual({ anchorUserId: 'b', anchorName: 'Bob' });
  });

  it('priority 1 — caller order wins when multiple anchors are SubCrew members', () => {
    const pick = pickAnchor({
      anchorIds: ['c', 'b', 'a'],
      subCrewMemberAnchorIds: new Set(['a', 'c']),
      crewEdgeCreatedByAnchor: empty,
      anchorNameById: new Map([['a', 'Alice'], ['c', 'Carol']]),
    });
    expect(pick?.anchorUserId).toBe('c');
  });

  it('priority 3 — picks most-recent Crew edge when no SubCrew context', () => {
    const pick = pickAnchor({
      anchorIds: ['a', 'b', 'c'],
      subCrewMemberAnchorIds: new Set(),
      crewEdgeCreatedByAnchor: new Map([
        ['a', new Date('2026-04-01T00:00:00Z')],
        ['b', new Date('2026-04-25T00:00:00Z')],
        ['c', new Date('2026-04-15T00:00:00Z')],
      ]),
      anchorNameById: new Map([['a', 'Alice'], ['b', 'Bob'], ['c', 'Carol']]),
    });
    expect(pick?.anchorUserId).toBe('b');
  });

  it('priority 3 — handles missing Crew createdAt entries (skips them)', () => {
    const pick = pickAnchor({
      anchorIds: ['a', 'b'],
      subCrewMemberAnchorIds: new Set(),
      crewEdgeCreatedByAnchor: new Map([['b', new Date('2026-04-15T00:00:00Z')]]),
      anchorNameById: new Map([['a', 'Alice'], ['b', 'Bob']]),
    });
    expect(pick?.anchorUserId).toBe('b');
  });

  it('priority 4 — alphabetical when no Crew createdAt info', () => {
    const pick = pickAnchor({
      anchorIds: ['c', 'a', 'b'],
      subCrewMemberAnchorIds: new Set(),
      crewEdgeCreatedByAnchor: empty,
      anchorNameById: new Map([['a', 'Carol'], ['b', 'Alice'], ['c', 'Bob']]),
    });
    // Sorted by name: Alice (b), Bob (c), Carol (a) → first is b
    expect(pick?.anchorUserId).toBe('b');
    expect(pick?.anchorName).toBe('Alice');
  });

  it('priority 4 — falls back to id when name missing for sort key', () => {
    const pick = pickAnchor({
      anchorIds: ['z', 'a'],
      subCrewMemberAnchorIds: new Set(),
      crewEdgeCreatedByAnchor: empty,
      anchorNameById: new Map(),
    });
    expect(pick?.anchorUserId).toBe('a');
  });

  it('returns null name when anchor has no name in the map', () => {
    const pick = pickAnchor({
      anchorIds: ['a'],
      subCrewMemberAnchorIds: new Set(['a']),
      crewEdgeCreatedByAnchor: empty,
      anchorNameById: new Map(),
    });
    expect(pick).toEqual({ anchorUserId: 'a', anchorName: null });
  });
});

describe('buildAnchorSummary', () => {
  it('returns null on empty input', () => {
    expect(buildAnchorSummary([])).toBeNull();
  });

  it('returns null when all entries are null', () => {
    expect(buildAnchorSummary([null, null])).toBeNull();
  });

  it('formats a single anchor', () => {
    expect(buildAnchorSummary(['Alice'])).toBe('via Alice');
  });

  it('formats two anchors inline', () => {
    expect(buildAnchorSummary(['Alice', 'Bob'])).toBe('via Alice, Bob');
  });

  it('truncates beyond max with "+ N more"', () => {
    expect(buildAnchorSummary(['Alice', 'Bob', 'Carol', 'Dan'])).toBe('via Alice, Bob + 2 more');
  });

  it('skips null entries when counting', () => {
    expect(buildAnchorSummary(['Alice', null, 'Bob', null, 'Carol'])).toBe('via Alice, Bob + 1 more');
  });
});
