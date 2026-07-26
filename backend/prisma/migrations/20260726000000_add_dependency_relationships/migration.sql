CREATE TABLE "dependency_relationships" (
    "id" UUID NOT NULL,
    "analysis_id" UUID NOT NULL,
    "source_dependency_id" UUID NOT NULL,
    "target_dependency_id" UUID NOT NULL,
    "relationship_type" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "risk_adjustment" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL,
    "evidence" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dependency_relationships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dep_relationships_analysis_source_target_key"
    ON "dependency_relationships"("analysis_id", "source_dependency_id", "target_dependency_id");

CREATE INDEX "dependency_relationships_analysis_id_idx" ON "dependency_relationships"("analysis_id");
CREATE INDEX "dependency_relationships_source_dependency_id_idx" ON "dependency_relationships"("source_dependency_id");
CREATE INDEX "dependency_relationships_target_dependency_id_idx" ON "dependency_relationships"("target_dependency_id");

ALTER TABLE "dependency_relationships"
    ADD CONSTRAINT "dependency_relationships_analysis_id_fkey"
    FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dependency_relationships"
    ADD CONSTRAINT "dependency_relationships_source_dependency_id_fkey"
    FOREIGN KEY ("source_dependency_id") REFERENCES "dependencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dependency_relationships"
    ADD CONSTRAINT "dependency_relationships_target_dependency_id_fkey"
    FOREIGN KEY ("target_dependency_id") REFERENCES "dependencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
