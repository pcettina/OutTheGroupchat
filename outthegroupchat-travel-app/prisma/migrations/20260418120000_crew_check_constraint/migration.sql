-- Phase 3: Enforce the single-row bidirectional invariant for Crew at the DB layer.
-- Every row must satisfy userAId < userBId (lexicographic), so a single pair
-- (A,B) can only be represented once and never as (B,A). See REFACTOR_PLAN.md §3.5
-- and §9 Q2 for the design decision.
--
-- Made idempotent because the constraint was applied out-of-band to the main
-- Neon DB before this migration landed; per-PR Neon branches inherit it, and
-- a plain `ADD CONSTRAINT` would fail with 42710 on any such branch.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Crew_user_order_check'
      AND conrelid = 'public."Crew"'::regclass
  ) THEN
    ALTER TABLE "Crew"
      ADD CONSTRAINT "Crew_user_order_check"
      CHECK ("userAId" < "userBId");
  END IF;
END $$;
