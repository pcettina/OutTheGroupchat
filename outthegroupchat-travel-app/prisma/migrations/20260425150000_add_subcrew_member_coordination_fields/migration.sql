-- V1 Phase 3 (Journey C — coordinate + commit): add per-member coordination
-- state to SubCrewMember.
--
-- proposedTime — non-seed members surface their "when works?" preference
--                here; seed members freeze SubCrew.startAt directly via
--                PATCH /api/subcrews/[id].
-- committedAt — set when the member transitions their Intent INTERESTED →
--               COMMITTED for this SubCrew (drives the per-event privacy
--               picker and HeatmapContribution write).

ALTER TABLE "SubCrewMember"
  ADD COLUMN "proposedTime" TIMESTAMP(3),
  ADD COLUMN "committedAt"  TIMESTAMP(3);
