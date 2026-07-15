-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "DependencyType" AS ENUM ('DEPENDENCY', 'DEV_DEPENDENCY');

-- CreateTable
CREATE TABLE "dependencies" (
    "id" UUID NOT NULL,
    "analysis_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version_requirement" TEXT NOT NULL,
    "type" "DependencyType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analyses" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "result_token" UUID NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_results" (
    "id" UUID NOT NULL,
    "analysis_id" UUID NOT NULL,
    "global_score" INTEGER NOT NULL,
    "risk_level" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dependency_scores" (
    "id" UUID NOT NULL,
    "analysis_result_id" UUID NOT NULL,
    "dependency_id" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "risk_level" TEXT NOT NULL,
    "popularity_score" INTEGER,
    "maintenance_score" INTEGER,
    "resolution_quality_score" INTEGER,
    "normalized_inputs" JSONB,
    "github_metrics" JSONB,
    "issue_metrics" JSONB,
    "issue_data" JSONB,
    "warnings" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dependency_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dependency_analysis_cache" (
    "id" UUID NOT NULL,
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

-- CreateIndex
CREATE INDEX "dependencies_analysis_id_idx" ON "dependencies"("analysis_id");

-- CreateIndex
CREATE UNIQUE INDEX "dependencies_analysis_id_name_type_key" ON "dependencies"("analysis_id", "name", "type");

-- CreateIndex
CREATE UNIQUE INDEX "analyses_result_token_key" ON "analyses"("result_token");

-- CreateIndex
CREATE INDEX "analyses_status_idx" ON "analyses"("status");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_results_analysis_id_key" ON "analysis_results"("analysis_id");

-- CreateIndex
CREATE INDEX "dependency_scores_dependency_id_idx" ON "dependency_scores"("dependency_id");

-- CreateIndex
CREATE UNIQUE INDEX "dependency_scores_analysis_result_id_dependency_id_key" ON "dependency_scores"("analysis_result_id", "dependency_id");

-- CreateIndex
CREATE UNIQUE INDEX "dependency_analysis_cache_cache_key_key" ON "dependency_analysis_cache"("cache_key");

-- CreateIndex
CREATE INDEX "dependency_analysis_cache_dependency_name_idx" ON "dependency_analysis_cache"("dependency_name");

-- CreateIndex
CREATE INDEX "dependency_analysis_cache_repository_full_name_idx" ON "dependency_analysis_cache"("repository_full_name");

-- CreateIndex
CREATE INDEX "dependency_analysis_cache_expires_at_idx" ON "dependency_analysis_cache"("expires_at");

-- AddForeignKey
ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_results" ADD CONSTRAINT "analysis_results_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependency_scores" ADD CONSTRAINT "dependency_scores_analysis_result_id_fkey" FOREIGN KEY ("analysis_result_id") REFERENCES "analysis_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependency_scores" ADD CONSTRAINT "dependency_scores_dependency_id_fkey" FOREIGN KEY ("dependency_id") REFERENCES "dependencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
