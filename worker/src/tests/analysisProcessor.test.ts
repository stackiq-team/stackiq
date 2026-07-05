import { AnalysisStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("../adapters/issuesMining.adapter.js", () => ({
  runIssuesMining: vi.fn(),
}));

import { processAnalysisJob } from "../analysisProcessor.js";

function createPrismaMock(
  analysis: { id: string; dependencies: any[] } | null = {
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
      upsert: vi.fn().mockResolvedValue({}),
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

const gitHubMetrics = {
  dependencyId: "dependency-1",
  packageName: "react",
  repository: {
    owner: "facebook",
    name: "react",
    fullName: "facebook/react",
    description: "React",
    url: "https://github.com/facebook/react",
    createdAt: "2013-05-24T00:00:00.000Z",
  },
  stars: 100000,
  forks: 20000,
  watchers: 5000,
  contributors: 100,
  createdAt: "2013-05-24T00:00:00.000Z",
  projectAgeDays: 4000,
  pullRequests: 10000,
  issues: 1000,
  license: "MIT",
  languages: ["TypeScript"],
  primaryLanguage: "TypeScript",
  topics: ["ui"],
  created_at: "2013-05-24T00:00:00.000Z",
  npm: {
    weeklyDownloads: 10000000,
    packageAgeDays: 4000,
    latestPublishAgeDays: 5,
    versionCount: 100,
    dependencyCount: 2,
    devDependencyCount: 10,
    hasLicense: true,
    hasRepository: true,
    hasReadme: true,
  },
};

const issueResult = {
  status: "SUCCESS" as const,
  metrics: {
    totalIssuesAnalyzed: 10,
    openIssues: 2,
    closedIssues: 8,
    closedIssuesAnalyzed: 8,
    recentActivityCount: 3,
    averageResolutionTimeHours: 48,
    averageResolutionTimeDays: 2,
    averageFirstResponseTimeDays: 1,
    firstResponseTimeHours: 24,
    closureRate: 0.8,
    noResponseRate: 0.1,
    closeRateByPR: 0.6,
    closedByPrRate: 0.6,
    closedByPRRate: 0.6,
    codeResolutionRate: 0.7,
    postCloseActivityRate: 0.1,
    openToAssignedTimeHours: null,
    mergedPRRate: 0.5,
    uncodedCloseRate: 0.2,
  },
};

function createDependency() {
  return {
    id: "dependency-1",
    name: "react",
    versionRequirement: "^19.0.0",
    type: "DEPENDENCY",
  };
}

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
    expect(prisma.analysisResult.upsert).toHaveBeenLastCalledWith({
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
    expect(prisma.dependencyScore.upsert).not.toHaveBeenCalled();
  });

  it("persists dependency scores when the analysis returns them", async () => {
    const prisma = createPrismaMock({
      id: "analysis-1",
      dependencies: [
        {
          id: "dependency-1",
          name: "react",
          versionRequirement: "^19.0.0",
          type: "DEPENDENCY",
        },
      ],
    });
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
    const runGitHubMiner = vi.fn().mockResolvedValue(null);

    await processAnalysisJob(job, {
      prisma,
      runAnalysis,
      runGitHubMiner,
      logger,
    });

    expect(prisma.dependencyScore.deleteMany).toHaveBeenCalledWith({
      where: {
        analysisResultId: "result-1",
      },
    });
    expect(prisma.dependencyScore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          analysisResultId_dependencyId: {
            analysisResultId: "result-1",
            dependencyId: "dependency-1",
          },
        },
        create: expect.objectContaining({
          analysisResultId: "result-1",
          dependencyId: "dependency-1",
          score: 72,
          riskLevel: "MEDIUM",
        }),
      })
    );
    expect(prisma.analysisResult.upsert).toHaveBeenLastCalledWith({
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
    expect(prisma.analysisResult.upsert).toHaveBeenCalledWith({
      where: { analysisId: "analysis-1" },
      create: {
        analysisId: "analysis-1",
        globalScore: 0,
        riskLevel: "HIGH",
        summary: "Analysis in progress. Scored 0 of 0 dependencies.",
      },
      update: {
        globalScore: 0,
        riskLevel: "HIGH",
        summary: "Analysis in progress. Scored 0 of 0 dependencies.",
      },
    });
    expect(prisma.dependencyScore.deleteMany).toHaveBeenCalledWith({
      where: {
        analysisResultId: "result-1",
      },
    });
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

  it("uses cached dependency analysis data without running miners", async () => {
    const prisma = createPrismaMock({
      id: "analysis-1",
      dependencies: [createDependency()],
    });
    const runAnalysis = vi.fn().mockResolvedValue({
      globalScore: 90,
      riskLevel: "LOW",
      summary: "Analysis completed.",
    });
    const runGitHubMiner = vi.fn();
    const runIssuesMining = vi.fn();
    const cacheManager = {
      buildLookup: vi.fn().mockReturnValue({ cacheKey: "lookup" }),
      findCache: vi.fn().mockResolvedValue({
        cacheKey: "npm:npm:react:19.0.0:unknown-repository:v1:test",
        gitHubMetrics,
        issueResult,
        score: {
          dependencyId: "dependency-1",
          score: 90,
          riskLevel: "LOW",
          breakdown: {
            popularityScore: 90,
            maintenanceScore: null,
            resolutionQualityScore: null,
            normalizedInputs: {},
          },
          warnings: [],
        },
        warnings: [],
        expiresAt: new Date(Date.now() + 1000),
      }),
      acquireLock: vi.fn(),
      save: vi.fn(),
    };

    await processAnalysisJob(job, {
      prisma,
      runAnalysis,
      runGitHubMiner,
      runIssuesMining,
      cacheManager: cacheManager as any,
      logger,
    });

    expect(cacheManager.findCache).toHaveBeenCalledTimes(1);
    expect(runGitHubMiner).not.toHaveBeenCalled();
    expect(runIssuesMining).not.toHaveBeenCalled();
    expect(cacheManager.save).not.toHaveBeenCalled();
    expect(runAnalysis).toHaveBeenCalledWith({
      analysisId: "analysis-1",
      dependencies: [
        expect.objectContaining({
          gitHubMetrics: expect.objectContaining({
            dependencyId: "dependency-1",
            repository: expect.objectContaining({ fullName: "facebook/react" }),
          }),
          issueMetrics: issueResult.metrics,
        }),
      ],
    });
  });

  it("saves dependency analysis data to cache after a miss", async () => {
    const prisma = createPrismaMock({
      id: "analysis-1",
      dependencies: [createDependency()],
    });
    const runAnalysis = vi.fn().mockResolvedValue({
      globalScore: 90,
      riskLevel: "LOW",
      summary: "Analysis completed.",
    });
    const runGitHubMiner = vi.fn().mockResolvedValue(gitHubMetrics);
    const runIssuesMining = vi.fn().mockResolvedValue(issueResult);
    const releaseLock = vi.fn().mockResolvedValue(undefined);
    const cacheManager = {
      buildLookup: vi.fn().mockReturnValue({ cacheKey: "lookup" }),
      buildCacheKey: vi.fn().mockReturnValue("cache-key"),
      findCache: vi.fn().mockResolvedValue(null),
      acquireLock: vi.fn().mockResolvedValue(releaseLock),
      save: vi.fn().mockResolvedValue(undefined),
    };

    await processAnalysisJob(job, {
      prisma,
      runAnalysis,
      runGitHubMiner,
      runIssuesMining,
      cacheManager: cacheManager as any,
      logger,
    });

    expect(cacheManager.findCache).toHaveBeenCalledTimes(2);
    expect(cacheManager.acquireLock).toHaveBeenCalledWith("cache-key");
    expect(runGitHubMiner).toHaveBeenCalledTimes(1);
    expect(runIssuesMining).toHaveBeenCalledTimes(1);
    expect(cacheManager.save).toHaveBeenCalledWith(
      { cacheKey: "lookup" },
      expect.objectContaining({
        dependency: expect.objectContaining({ name: "react" }),
        gitHubMetrics,
        issueMetrics: issueResult.metrics,
      }),
      expect.objectContaining({
        dependencyId: "dependency-1",
        score: expect.any(Number),
      }),
      issueResult
    );
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });
});
