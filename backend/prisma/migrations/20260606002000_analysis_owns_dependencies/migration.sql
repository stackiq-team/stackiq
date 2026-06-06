-- Move the submission identity from Stack to Analysis.
ALTER TABLE "analyses" ADD COLUMN "email" TEXT;

UPDATE "analyses"
SET "email" = "stacks"."name"
FROM "stacks"
WHERE "analyses"."stack_id" = "stacks"."id";

UPDATE "analyses"
SET "email" = 'unknown@example.com'
WHERE "email" IS NULL;

ALTER TABLE "analyses" ALTER COLUMN "email" SET NOT NULL;

-- Re-parent dependencies from Stack to Analysis. Existing data is attached to
-- the first analysis created for each stack, which matches the current MVP flow.
ALTER TABLE "dependencies" ADD COLUMN "analysis_id" UUID;

UPDATE "dependencies"
SET "analysis_id" = first_analysis."id"
FROM (
    SELECT DISTINCT ON ("stack_id") "id", "stack_id"
    FROM "analyses"
    ORDER BY "stack_id", "created_at", "id"
) AS first_analysis
WHERE "dependencies"."stack_id" = first_analysis."stack_id";

ALTER TABLE "dependencies" ALTER COLUMN "analysis_id" SET NOT NULL;

-- Replace old Stack-based constraints and indexes.
ALTER TABLE "dependencies" DROP CONSTRAINT "dependencies_stack_id_fkey";
ALTER TABLE "analyses" DROP CONSTRAINT "analyses_stack_id_fkey";

DROP INDEX "dependencies_stack_id_name_type_key";
DROP INDEX "dependencies_stack_id_idx";
DROP INDEX "analyses_stack_id_status_idx";

ALTER TABLE "dependencies" DROP COLUMN "stack_id";
ALTER TABLE "analyses" DROP COLUMN "stack_id";

DROP TABLE "stacks";

CREATE INDEX "dependencies_analysis_id_idx" ON "dependencies"("analysis_id");
CREATE UNIQUE INDEX "dependencies_analysis_id_name_type_key" ON "dependencies"("analysis_id", "name", "type");
CREATE INDEX "analyses_status_idx" ON "analyses"("status");

ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
