import { AnalysisStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { processAnalysisJob } from "../analysisProcessor.js";

function createPrismaMock(analysis: { id: string } | null = { id: "analysis-1" }) {
  return {
    analysis: {
      findUnique: vi.fn().mockResolvedValue(analysis),
      update: vi.fn().mockResolvedValue({}),
    },
    analysisResult: {
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
}

const job = {
  id: "job-1",
  attemptsMade: 0,
  data: {
    analysisId: "analysis-1",
    stackId: "stack-1",
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
    });
    expect(runAnalysis).toHaveBeenCalledWith({
      analysisId: "analysis-1",
      stackId: "stack-1",
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
