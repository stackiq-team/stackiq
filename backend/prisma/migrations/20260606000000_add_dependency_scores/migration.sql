-- CreateTable
CREATE TABLE "dependency_scores" (
    "id" UUID NOT NULL,
    "analysis_result_id" UUID NOT NULL,
    "dependency_id" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "risk_level" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dependency_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dependency_scores_analysis_result_id_dependency_id_key" ON "dependency_scores"("analysis_result_id", "dependency_id");

-- CreateIndex
CREATE INDEX "dependency_scores_dependency_id_idx" ON "dependency_scores"("dependency_id");

-- AddForeignKey
ALTER TABLE "dependency_scores" ADD CONSTRAINT "dependency_scores_analysis_result_id_fkey" FOREIGN KEY ("analysis_result_id") REFERENCES "analysis_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependency_scores" ADD CONSTRAINT "dependency_scores_dependency_id_fkey" FOREIGN KEY ("dependency_id") REFERENCES "dependencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
