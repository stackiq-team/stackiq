import type { AddressInfo } from "node:net";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, queueState } = vi.hoisted(() => {
  const state = {
    analysis: null as null | {
      id: string;
      email: string | null;
      status: string;
      resultToken: string;
      errorMessage: string | null;
      dependencies: Array<{
        id: string;
        analysisId: string;
        name: string;
        versionRequirement: string;
        type: "DEPENDENCY" | "DEV_DEPENDENCY";
      }>;
    },
    result: null as null | {
      id: string;
      analysisId: string;
      globalScore: number;
      riskLevel: string;
      summary: string;
    },
    dependencyScores: [] as Array<{
      analysisResultId: string;
      dependencyId: string;
      score: number;
      riskLevel: string;
      popularityScore?: number | null;
      maintenanceScore?: number | null;
      resolutionQualityScore?: number | null;
      normalizedInputs?: unknown;
      githubMetrics?: unknown;
      issueMetrics?: unknown;
      warnings?: unknown;
    }>,
    queuedJob: null as null | { analysisId: string },
  };

  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]),
    analysis: {
      create: vi.fn(async (args) => {
        const dependencies = args.data.dependencies.create.map(
          (
            dependency: {
              name: string;
              versionRequirement: string;
              type: "DEPENDENCY" | "DEV_DEPENDENCY";
            },
            index: number
          ) => ({
            id: `dependency-${index + 1}`,
            analysisId: "analysis-1",
            ...dependency,
          })
        );

        state.analysis = {
          id: "analysis-1",
          email: args.data.email,
          status: args.data.status,
          resultToken: "result-token-1",
          errorMessage: null,
          dependencies,
        };

        return state.analysis;
      }),
      findUnique: vi.fn(async () => state.analysis),
      update: vi.fn(async (args) => {
        if (!state.analysis) {
          throw new Error("Analysis was not created");
        }

        state.analysis = {
          ...state.analysis,
          ...args.data,
        };

        return state.analysis;
      }),
    },
    analysisResult: {
      upsert: vi.fn(async (args) => {
        state.result = state.result
          ? {
              ...state.result,
              ...args.update,
            }
          : {
              id: "result-1",
              analysisId: args.where.analysisId,
              ...args.create,
            };

        return { id: state.result.id };
      }),
    },
    dependencyScore: {
      deleteMany: vi.fn(async () => {
        state.dependencyScores = [];
      }),
      createMany: vi.fn(async (args) => {
        state.dependencyScores = args.data;
        return { count: args.data.length };
      }),
      upsert: vi.fn(async (args) => {
        const index = state.dependencyScores.findIndex(
          (score) =>
            score.analysisResultId === args.where.analysisResultId_dependencyId.analysisResultId &&
            score.dependencyId === args.where.analysisResultId_dependencyId.dependencyId
        );

        const nextScore = index >= 0
          ? {
              ...state.dependencyScores[index],
              ...args.update,
            }
          : args.create;

        if (index >= 0) {
          state.dependencyScores[index] = nextScore;
        } else {
          state.dependencyScores.push(nextScore);
        }

        return nextScore;
      }),
    },
  };

  return {
    prismaMock: prisma,
    queueState: state,
  };
});

vi.mock("../backend/src/db/client", () => ({
  prisma: prismaMock,
  connectDB: vi.fn(),
}));

vi.mock("../backend/src/redis/client", () => ({
  redis: {
    ping: vi.fn().mockResolvedValue("PONG"),
  },
}));

vi.mock("../backend/src/queue/analysisQueue", () => ({
  enqueueAnalysisJob: vi.fn(async (data: { analysisId: string }) => {
    queueState.queuedJob = data;
    return { id: data.analysisId };
  }),
}));

vi.mock("../worker/src/adapters/issuesMining.adapter.js", () => ({
  runIssuesMining: vi.fn(),
}));

import { app } from "../backend/src/app";
import { processAnalysisJob } from "../worker/src/analysisProcessor.js";

describe("analysis flow", () => {
  beforeEach(() => {
    queueState.analysis = null;
    queueState.result = null;
    queueState.dependencyScores = [];
    queueState.queuedJob = null;
    vi.clearAllMocks();
  });

  it("submits a package file, enqueues analysis, and stores worker scores", async () => {
    const server = app.listen(0);

    try {
      const address = server.address() as AddressInfo;
      const formData = new FormData();
      const packageJson = {
        name: "frontend",
        dependencies: {
          "react-bootstrap-country-select": "^19.2.6",
        },
        devDependencies: {
          "radix-select-vitest": "^4.1.7",
        },
      };

      formData.append("email", "test@example.com");
      formData.append(
        "file",
        new File([JSON.stringify(packageJson)], "package.json", {
          type: "application/json",
        })
      );

      const response = await fetch(
        `http://127.0.0.1:${address.port}/analyses`,
        {
          method: "POST",
          body: formData,
        }
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.analysis).toMatchObject({
        id: "analysis-1",
        email: "test@example.com",
        status: "PENDING",
        resultToken: "result-token-1",
      });
      expect(queueState.queuedJob).toEqual({ analysisId: "analysis-1" });

      await processAnalysisJob(
        {
          id: "analysis-1",
          attemptsMade: 0,
          data: queueState.queuedJob!,
        },
        {
          prisma: prismaMock,
          runGitHubMiner: vi.fn(async (dependency) => ({
            dependencyId: dependency.dependencyId,
            packageName: dependency.fullPackageName,
            repository: {
              owner: "facebook",
              name: "react",
              fullName: "facebook/react",
              description: "React",
              url: "https://github.com/facebook/react",
              createdAt: "2015-01-01",
            },
            stars: 100000,
            forks: 20000,
            watchers: 5000,
            contributors: 100,
            createdAt: "2015-01-01",
            projectAgeDays: 365 * 5,
            pullRequests: 20000,
            issues: 100,
            license: "MIT",
            languages: ["JavaScript"],
            primaryLanguage: "JavaScript",
            topics: ["react"],
            created_at: "2015-01-01",
            npm: {
              weeklyDownloads: 10000000,
              packageAgeDays: 365 * 5,
              latestPublishAgeDays: 0,
              versionCount: 100,
              dependencyCount: 0,
              devDependencyCount: 0,
              hasLicense: true,
              hasRepository: true,
              hasReadme: true,
            },
          })),
          runIssuesMining: vi.fn(async () => ({
            status: "SUCCESS",
            metrics: {
              totalIssuesAnalyzed: 10,
              openIssues: 0,
              closedIssues: 10,
              closedIssuesAnalyzed: 10,
              recentActivityCount: 4,
              averageResolutionTimeHours: 7 * 24,
              averageResolutionTimeDays: 7,
              averageFirstResponseTimeDays: 1,
              firstResponseTimeHours: 24,
              closureRate: 1,
              noResponseRate: 0,
              closeRateByPR: 1,
              closedByPrRate: 1,
              closedByPRRate: 1,
              codeResolutionRate: 1,
              postCloseActivityRate: 0,
              openToAssignedTimeHours: 24,
              mergedPRRate: 1,
              uncodedCloseRate: 0,
            },
          })),
          logger: {
            log: vi.fn(),
            error: vi.fn(),
          },
        }
      );

      expect(queueState.analysis?.status).toBe("COMPLETED");
      expect(queueState.result).toMatchObject({
        analysisId: "analysis-1",
        globalScore: 100,
        riskLevel: "LOW",
        summary: "Scored 2 dependencies (0 high risk).",
      });
      expect(queueState.dependencyScores).toEqual([
        expect.objectContaining({
          analysisResultId: "result-1",
          dependencyId: "dependency-1",
          score: 100,
          riskLevel: "LOW",
          popularityScore: 100,
          maintenanceScore: 100,
          resolutionQualityScore: 100,
        }),
        expect.objectContaining({
          analysisResultId: "result-1",
          dependencyId: "dependency-2",
          score: 100,
          riskLevel: "LOW",
          popularityScore: 100,
          maintenanceScore: 100,
          resolutionQualityScore: 100,
        }),
      ]);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });
});
