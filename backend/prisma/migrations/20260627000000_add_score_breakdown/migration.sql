ALTER TABLE "dependency_scores"
ADD COLUMN "popularity_score" INTEGER,
ADD COLUMN "maintenance_score" INTEGER,
ADD COLUMN "resolution_quality_score" INTEGER,
ADD COLUMN "normalized_inputs" JSONB,
ADD COLUMN "github_metrics" JSONB,
ADD COLUMN "issue_metrics" JSONB,
ADD COLUMN "warnings" JSONB;
