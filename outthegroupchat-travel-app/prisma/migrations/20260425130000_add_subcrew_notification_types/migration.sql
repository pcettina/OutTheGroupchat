-- V1 Phase 2 (Journey B — alignment + join): add SubCrew-related notification
-- types. Used by `tryFormSubCrew` and POST /api/subcrews/[id]/join to push
-- in-app alerts when a SubCrew auto-forms or someone joins via "I'm in".
--
-- Postgres requires ALTER TYPE ADD VALUE to run outside a transaction; Prisma
-- handles this automatically when each statement is its own block.

ALTER TYPE "NotificationType" ADD VALUE 'SUBCREW_FORMED';
ALTER TYPE "NotificationType" ADD VALUE 'SUBCREW_JOINED';
