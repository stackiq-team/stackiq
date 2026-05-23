-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "DependencyType" AS ENUM ('DEPENDENCY', 'DEV_DEPENDENCY');

-- CreateTable
CREATE TABLE "stacks" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dependencies" (
    "id" UUID NOT NULL,
    "stack_id" UUID NOT NULL,
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
    "stack_id" UUID NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "result_token" UUID NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dependencies_stack_id_idx" ON "dependencies"("stack_id");

-- CreateIndex
CREATE UNIQUE INDEX "dependencies_stack_id_name_type_key" ON "dependencies"("stack_id", "name", "type");

-- CreateIndex
CREATE UNIQUE INDEX "analyses_result_token_key" ON "analyses"("result_token");

-- CreateIndex
CREATE INDEX "analyses_stack_id_status_idx" ON "analyses"("stack_id", "status");

-- AddForeignKey
ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_stack_id_fkey" FOREIGN KEY ("stack_id") REFERENCES "stacks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_stack_id_fkey" FOREIGN KEY ("stack_id") REFERENCES "stacks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
