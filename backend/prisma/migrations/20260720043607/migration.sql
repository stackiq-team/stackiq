-- CreateTable
CREATE TABLE "leaderboard_repositories" (
    "id" UUID NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "stars" INTEGER NOT NULL,
    "forks" INTEGER NOT NULL,
    "watchers" INTEGER NOT NULL,
    "issues" INTEGER NOT NULL,
    "pullRequests" INTEGER NOT NULL,
    "license" TEXT,
    "primaryLanguage" TEXT,
    "topics" TEXT[],
    "repository_created_at" TIMESTAMP(3) NOT NULL,
    "pushed_at" TIMESTAMP(3) NOT NULL,
    "github_popularity_score" INTEGER NOT NULL,
    "github_activity_score" INTEGER NOT NULL,
    "github_compatibility_score" INTEGER NOT NULL,
    "analysis_score" INTEGER,
    "analysis_status" TEXT,
    "analysis_result_token" TEXT,
    "analysis_id" TEXT,
    "package_json_present" BOOLEAN NOT NULL,
    "category" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leaderboard_repositories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leaderboard_repositories_category_rank_idx" ON "leaderboard_repositories"("category", "rank");

-- CreateIndex
CREATE INDEX "leaderboard_repositories_full_name_idx" ON "leaderboard_repositories"("full_name");

-- CreateIndex
CREATE UNIQUE INDEX "leaderboard_repositories_full_name_category_key" ON "leaderboard_repositories"("full_name", "category");
