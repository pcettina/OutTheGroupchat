-- Phase 3: Enforce the single-row bidirectional invariant for Crew at the DB layer.
-- Every row must satisfy userAId < userBId (lexicographic), so a single pair
-- (A,B) can only be represented once and never as (B,A). See REFACTOR_PLAN.md §3.5
-- and §9 Q2 for the design decision.
ALTER TABLE "Crew"
  ADD CONSTRAINT "Crew_user_order_check"
  CHECK ("userAId" < "userBId");
