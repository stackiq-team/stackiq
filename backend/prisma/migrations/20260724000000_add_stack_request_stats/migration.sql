-- CreateTable
CREATE TABLE "stack_request_stats" (
    "id" UUID NOT NULL,
    "stack_hash" TEXT NOT NULL,
    "stack_payload" JSONB NOT NULL,
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stack_request_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stack_request_stats_request_count_idx" ON "stack_request_stats"("request_count");

-- CreateIndex
CREATE UNIQUE INDEX "stack_request_stats_stack_hash_key"
ON "stack_request_stats"("stack_hash");
