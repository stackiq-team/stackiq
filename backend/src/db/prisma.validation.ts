import assert from "node:assert/strict";
import { AnalysisStatus, DependencyType } from "../generated/prisma/enums";
import { prisma } from "./client";

async function validateMigrations() {
  const rows = await prisma.$queryRaw<Array<{ migration_count: bigint }>>`
    SELECT COUNT(*)::bigint AS migration_count
    FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL
  `;

  assert.ok(rows[0]?.migration_count > 0n, "No applied Prisma migrations found");
}

async function validateCrudAndRelationships() {
  const runId = `validation-${Date.now()}`;

  const stack = await prisma.stack.create({
    data: {
      name: runId,
      dependencies: {
        create: [
          {
            name: "express",
            versionRequirement: "^5.2.1",
            type: DependencyType.DEPENDENCY,
          },
          {
            name: "typescript",
            versionRequirement: "^6.0.3",
            type: DependencyType.DEV_DEPENDENCY,
          },
        ],
      },
      analyses: {
        create: {
          status: AnalysisStatus.PENDING,
        },
      },
    },
    include: {
      analyses: true,
    },
  });

  const analysis = stack.analyses[0];
  assert.ok(analysis);
  assert.equal(analysis.status, AnalysisStatus.PENDING);
  assert.ok(analysis.resultToken);

  const updatedAnalysis = await prisma.analysis.update({
    where: { id: analysis.id },
    data: {
      status: AnalysisStatus.PROCESSING,
    },
  });

  assert.equal(updatedAnalysis.status, AnalysisStatus.PROCESSING);

  const loaded = await prisma.stack.findUniqueOrThrow({
    where: { id: stack.id },
    include: {
      dependencies: true,
      analyses: true,
    },
  });

  assert.equal(loaded.dependencies.length, 2);
  assert.equal(
    loaded.dependencies.some((dependency) => dependency.type === DependencyType.DEPENDENCY),
    true
  );
  assert.equal(
    loaded.dependencies.some((dependency) => dependency.type === DependencyType.DEV_DEPENDENCY),
    true
  );
  assert.equal(loaded.analyses.length, 1);
  assert.equal(loaded.analyses[0]?.id, analysis.id);

  await prisma.stack.delete({
    where: { id: stack.id },
  });
}

async function main() {
  await prisma.$connect();
  await validateMigrations();
  await validateCrudAndRelationships();
  console.log("Prisma validation passed");
}

main()
  .catch((error) => {
    console.error("Prisma validation failed");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
