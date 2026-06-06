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

  const analysis = await prisma.analysis.create({
    data: {
      email: `${runId}@example.com`,
      status: AnalysisStatus.PENDING,
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
    },
    include: {
      dependencies: true,
    },
  });

  assert.equal(analysis.status, AnalysisStatus.PENDING);
  assert.ok(analysis.resultToken);

  const updatedAnalysis = await prisma.analysis.update({
    where: { id: analysis.id },
    data: {
      status: AnalysisStatus.PROCESSING,
    },
  });

  assert.equal(updatedAnalysis.status, AnalysisStatus.PROCESSING);

  const loaded = await prisma.analysis.findUniqueOrThrow({
    where: { id: analysis.id },
    include: {
      dependencies: true,
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

  await prisma.analysis.delete({
    where: { id: analysis.id },
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
