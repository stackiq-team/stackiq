import { AnalysisStatus } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../adapters/issuesMining.adapter.js", () => ({
  runIssuesMining: vi.fn(),
}));

vi.mock("../adapters/email.adapter.js", () => ({
  sendResultEmail: vi.fn().mockResolvedValue(true),
}));

import { processAnalysisJob } from "../analysisProcessor.js";
import { sendResultEmail } from "../adapters/email.adapter.js";

const envBackup = { ...process.env };

afterEach(() => {
  process.env = { ...envBackup };
  vi.clearAllMocks();
});

function createPrismaMock(
  analysis: { id: string; dependencies: any[], email?: string } | null = {
    id: "analysis-1",
    email:"test@example.com",
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
    email: "test@example.com",
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
    medianResolutionTimeDays: 2,
    averageFirstResponseTimeDays: 1,
    medianFirstResponseTimeDays: 1,
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
    healthyClosureRate: 0.8,
    staleOpenIssueRate: 0.1,
    sampleRecentOpenIssues: 2,
    sampleRecentClosedIssues: 4,
    sampleOlderClosedIssues: 4,
    sampleOldOpenIssues: 0,
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
      email:"test@example.com",
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

  it("sends the analysis result email when an email address is provided", async () => {
    vi.clearAllMocks();

    const prisma = createPrismaMock();
    const runAnalysis = vi.fn().mockResolvedValue({
      globalScore: 88,
      riskLevel: "LOW",
      summary: "Analysis completed.",
    });

    await processAnalysisJob(job, {
      prisma,
      runAnalysis,
      logger,
    });

    expect(sendResultEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        globalScore: 88,
        riskLevel: "LOW",
        summary: "Analysis completed.",
      }),
      "test@example.com",
      "",
      expect.arrayContaining([
        expect.objectContaining({
          filename: expect.stringMatching(/stackiq-full-report-/),
          contentType: "application/pdf",
        }),
      ])
    );
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
      email:"test@example.com",
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

  it("skips result email and relationship persistence when no email and no relationship delegate are provided", async () => {
    const prisma = createPrismaMock({
      id: "analysis-1",
      dependencies: [createDependency()],
    });
    const runAnalysis = vi.fn().mockResolvedValue({
      globalScore: 91,
      riskLevel: "LOW",
      summary: "Analysis completed.",
    });
    const runGitHubMiner = vi.fn().mockResolvedValue(gitHubMetrics);
    const runIssuesMining = vi.fn().mockResolvedValue({
      ...issueResult,
      issueData: [],
    });

    await processAnalysisJob(
      {
        id: "job-1",
        attemptsMade: 0,
        data: {
          analysisId: "analysis-1",
        },
      },
      {
        prisma,
        runAnalysis,
        runGitHubMiner,
        runIssuesMining,
        logger,
      }
    );

    expect(runAnalysis).toHaveBeenCalledWith({
      analysisId: "analysis-1",
      dependencies: expect.any(Array),
    });
    expect(sendResultEmail).not.toHaveBeenCalled();
    expect(prisma.analysis.update).toHaveBeenLastCalledWith({
      where: { id: "analysis-1" },
      data: {
        status: AnalysisStatus.COMPLETED,
        errorMessage: null,
      },
    });
  });

  it("persists dependency relationships and skips dev dependency issue mining when disabled", async () => {
    process.env.ISSUES_MINING_INCLUDE_DEV_DEPENDENCIES = "false";
    process.env.DEPENDENCY_RELATIONSHIPS_ENABLED = "true";
    process.env.DEPENDENCY_RELATIONSHIP_DEEP_ISSUES_ENABLED = "false";

    const prisma = createPrismaMock({
      id: "analysis-1",
      dependencies: [
        {
          id: "dependency-1",
          name: "express",
          versionRequirement: "^4.0.0",
          type: "DEPENDENCY",
        },
        {
          id: "dependency-2",
          name: "cors",
          versionRequirement: "^2.0.0",
          type: "DEV_DEPENDENCY",
        },
      ],
    });
    prisma.dependencyRelationship = {
      deleteMany: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
    } as any;

    const runAnalysis = vi.fn().mockResolvedValue({
      globalScore: 82,
      riskLevel: "LOW",
      summary: "Analysis completed.",
      dependencyScores: [
        {
          dependencyId: "dependency-1",
          score: 82,
          riskLevel: "LOW" as const,
        },
        {
          dependencyId: "dependency-2",
          score: 61,
          riskLevel: "MEDIUM" as const,
        },
      ],
    });

    const runGitHubMiner = vi.fn().mockImplementation(async ({ fullPackageName }) => {
      if (fullPackageName === "express") {
        return {
          ...gitHubMetrics,
          dependencyId: "dependency-1",
          packageName: "express",
          repository: {
            owner: "expressjs",
            name: "express",
            fullName: "expressjs/express",
            description: "Express",
            url: "https://github.com/expressjs/express",
            createdAt: "2014-01-01T00:00:00.000Z",
          },
        };
      }

      return {
        ...gitHubMetrics,
        dependencyId: "dependency-2",
        packageName: "cors",
        repository: {
          owner: "expressjs",
          name: "cors",
          fullName: "expressjs/cors",
          description: "Cors",
          url: "https://github.com/expressjs/cors",
          createdAt: "2014-01-01T00:00:00.000Z",
        },
      };
    });

    const runIssuesMining = vi.fn().mockResolvedValue({
      status: "SUCCESS" as const,
      metrics: issueResult.metrics,
      issueData: [
        {
          number: 9021,
          title: "CORS middleware does not work with this setup",
          url: "https://github.com/expressjs/express/issues/9021",
          closed: false,
          publishedAt: "2026-01-01T00:00:00Z",
          closedAt: null,
          assigneesCount: 0,
          firstAssignedAt: null,
          closer: {
            stateReason: null,
            type: null,
            merged: null,
            closedByBot: null,
            closedByLogin: null,
            wasReclassified: false,
          },
          hasConnectedEvent: false,
          hasPostCloseActivity: false,
          tooManyTimelineItems: false,
          timelineTotalCount: 0,
          timelineCapturedCount: 0,
          bodyPreview: "The cors package conflicts with this middleware order.",
          labels: ["bug"],
        },
      ],
    });

    await processAnalysisJob(
      {
        id: "job-1",
        attemptsMade: 0,
        data: {
          analysisId: "analysis-1",
        },
      },
      {
        prisma,
        runAnalysis,
        runGitHubMiner,
        runIssuesMining,
        logger,
      }
    );

    expect(runIssuesMining).toHaveBeenCalledTimes(1);
    expect(runIssuesMining).toHaveBeenCalledWith("expressjs", "express", expect.any(String));
    expect(prisma.dependencyRelationship?.deleteMany).toHaveBeenCalledWith({
      where: { analysisId: "analysis-1" },
    });
    expect(prisma.dependencyRelationship?.upsert).toHaveBeenCalled();
    expect(sendResultEmail).not.toHaveBeenCalled();
  });
});
