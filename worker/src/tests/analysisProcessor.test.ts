import { AnalysisStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { processAnalysisJob } from "../analysisProcessor.js";

function createPrismaMock(
  analysis: { id: string; dependencies: [] } | null = {
    id: "analysis-1",
    dependencies: [],
  }
) {
  return {
    analysis: {
      findUnique: vi.fn().mockResolvedValue(analysis),
      update: vi.fn().mockResolvedValue({}),
    },
    analysisResult: {
      upsert: vi.fn().mockResolvedValue({ id: "result-1" }),
    },
    dependencyScore: {
      deleteMany: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

const job = {
  id: "job-1",
  attemptsMade: 0,
  data: {
    analysisId: "analysis-1",
  },
};

const logger = {
  log: vi.fn(),
  error: vi.fn(),
};

describe("processAnalysisJob", () => {
  it("moves an analysis from PROCESSING to COMPLETED when the job succeeds", async () => {
    const prisma = createPrismaMock();
    const runAnalysis = vi.fn().mockResolvedValue({
      globalScore: 87,
      riskLevel: "LOW",
      summary: "Analysis completed.",
    });

    await processAnalysisJob(job, {
      prisma,
      runAnalysis,
      logger,
    });

    expect(prisma.analysis.findUnique).toHaveBeenCalledWith({
      where: { id: "analysis-1" },
      include: {
        dependencies: true,
      },
    });
    expect(runAnalysis).toHaveBeenCalledWith({
      analysisId: "analysis-1",
      dependencies: [],
    });
    expect(prisma.analysis.update).toHaveBeenNthCalledWith(1, {
      where: { id: "analysis-1" },
      data: {
        status: AnalysisStatus.PROCESSING,
        errorMessage: null,
      },
    });
    expect(prisma.analysis.update).toHaveBeenNthCalledWith(2, {
      where: { id: "analysis-1" },
      data: {
        status: AnalysisStatus.COMPLETED,
        errorMessage: null,
      },
    });
    expect(prisma.analysisResult.upsert).toHaveBeenCalledWith({
      where: { analysisId: "analysis-1" },
      create: {
        analysisId: "analysis-1",
        globalScore: 87,
        riskLevel: "LOW",
        summary: "Analysis completed.",
      },
      update: {
        globalScore: 87,
        riskLevel: "LOW",
        summary: "Analysis completed.",
      },
    });
    expect(prisma.dependencyScore.deleteMany).toHaveBeenCalledWith({
      where: {
        analysisResultId: "result-1",
      },
    });
    expect(prisma.dependencyScore.createMany).not.toHaveBeenCalled();
  });

  it("persists dependency scores when the analysis returns them", async () => {
    const prisma = createPrismaMock();
    const runAnalysis = vi.fn().mockResolvedValue({
      globalScore: 72,
      riskLevel: "MEDIUM",
      summary: "Analysis completed.",
      dependencyScores: [
        {
          dependencyId: "dependency-1",
          score: 72,
          riskLevel: "MEDIUM",
        },
      ],
    });

    await processAnalysisJob(job, {
      prisma,
      runAnalysis,
      logger,
    });

    expect(prisma.dependencyScore.deleteMany).toHaveBeenCalledWith({
      where: {
        analysisResultId: "result-1",
      },
    });
    expect(prisma.dependencyScore.createMany).toHaveBeenCalledWith({
      data: [
        {
          analysisResultId: "result-1",
          dependencyId: "dependency-1",
          score: 72,
          riskLevel: "MEDIUM",
        },
      ],
    });
    expect(prisma.analysisResult.upsert).toHaveBeenCalledWith({
      where: { analysisId: "analysis-1" },
      create: {
        analysisId: "analysis-1",
        globalScore: 72,
        riskLevel: "MEDIUM",
        summary: "Analysis completed.",
      },
      update: {
        globalScore: 72,
        riskLevel: "MEDIUM",
        summary: "Analysis completed.",
      },
    });
  });

  it("moves an analysis to FAILED and rethrows when the job fails", async () => {
    const prisma = createPrismaMock();
    const error = new Error("analysis failed");
    const runAnalysis = vi.fn().mockRejectedValue(error);

    await expect(
      processAnalysisJob(job, {
        prisma,
        runAnalysis,
        logger,
      })
    ).rejects.toThrow("analysis failed");

    expect(prisma.analysis.update).toHaveBeenNthCalledWith(2, {
      where: { id: "analysis-1" },
      data: {
        status: AnalysisStatus.FAILED,
        errorMessage: "analysis failed",
      },
    });
    expect(prisma.analysisResult.upsert).not.toHaveBeenCalled();
    expect(prisma.dependencyScore.deleteMany).not.toHaveBeenCalled();
  });

  it("throws when the analysis does not exist so BullMQ can retry the job", async () => {
    const prisma = createPrismaMock(null);

    await expect(
      processAnalysisJob(job, {
        prisma,
        logger,
      })
    ).rejects.toThrow("Analysis analysis-1 was not found");

    expect(prisma.analysis.update).not.toHaveBeenCalled();
  });
});
