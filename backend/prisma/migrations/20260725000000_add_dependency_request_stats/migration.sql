-- CreateTable
CREATE TABLE "dependency_request_stats" (
    "id" UUID NOT NULL,
    "dependency_name" TEXT NOT NULL,
    "dependency_type" "DependencyType" NOT NULL,
    "last_version_requirement" TEXT NOT NULL,
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dependency_request_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dependency_request_stats_request_count_idx" ON "dependency_request_stats"("request_count");

-- CreateIndex
CREATE UNIQUE INDEX "dependency_request_stats_dependency_name_dependency_type_key"
ON "dependency_request_stats"("dependency_name", "dependency_type");
