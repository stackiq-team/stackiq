CREATE TABLE "dependency_relationship_cache" (
    "id" UUID NOT NULL,
    "cache_key" TEXT NOT NULL,
    "source_repository_full_name" TEXT NOT NULL,
    "source_package_name" TEXT NOT NULL,
    "target_package_name" TEXT NOT NULL,
    "relationship_type" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "risk_adjustment" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL,
    "evidence" JSONB,
    "search_total_count" INTEGER NOT NULL DEFAULT 0,
    "search_result_count" INTEGER NOT NULL DEFAULT 0,
    "cache_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_accessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dependency_relationship_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dependency_relationship_cache_cache_key_key"
    ON "dependency_relationship_cache"("cache_key");

CREATE INDEX "dependency_relationship_cache_source_repository_full_name_idx"
    ON "dependency_relationship_cache"("source_repository_full_name");

CREATE INDEX "dependency_relationship_cache_target_package_name_idx"
    ON "dependency_relationship_cache"("target_package_name");

CREATE INDEX "dependency_relationship_cache_expires_at_idx"
    ON "dependency_relationship_cache"("expires_at");
