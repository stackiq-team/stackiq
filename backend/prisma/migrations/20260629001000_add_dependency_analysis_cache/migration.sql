CREATE TABLE "dependency_analysis_cache" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "cache_key" TEXT NOT NULL,
  "ecosystem" TEXT NOT NULL,
  "package_manager" TEXT NOT NULL,
  "dependency_name" TEXT NOT NULL,
  "version_requirement" TEXT,
  "version_bucket" TEXT,
  "repository_owner" TEXT,
  "repository_name" TEXT,
  "repository_full_name" TEXT,
  "repository_url" TEXT,
  "github_miner_raw" JSONB,
  "issues_mining_raw" JSONB,
  "issue_metrics" JSONB,
  "normalized_metrics" JSONB,
  "score" INTEGER,
  "risk_level" TEXT,
  "popularity_score" INTEGER,
  "maintenance_score" INTEGER,
  "resolution_quality_score" INTEGER,
  "warnings" JSONB,
  "status" TEXT NOT NULL DEFAULT 'SUCCESS',
  "issues_config_hash" TEXT NOT NULL,
  "cache_version" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "last_accessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dependency_analysis_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dependency_analysis_cache_cache_key_key" ON "dependency_analysis_cache"("cache_key");
CREATE INDEX "dependency_analysis_cache_dependency_name_idx" ON "dependency_analysis_cache"("dependency_name");
CREATE INDEX "dependency_analysis_cache_repository_full_name_idx" ON "dependency_analysis_cache"("repository_full_name");
CREATE INDEX "dependency_analysis_cache_expires_at_idx" ON "dependency_analysis_cache"("expires_at");
