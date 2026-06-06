import type { AddressInfo } from "node:net";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, queueState } = vi.hoisted(() => {
  const state = {
    analysis: null as null | {
      id: string;
      email: string;
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
        state.result = {
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
          react: "^19.2.6",
        },
        devDependencies: {
          vitest: "^4.1.7",
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
          logger: {
            log: vi.fn(),
            error: vi.fn(),
          },
        }
      );

      expect(queueState.analysis?.status).toBe("COMPLETED");
      expect(queueState.result).toMatchObject({
        analysisId: "analysis-1",
        globalScore: 90,
        riskLevel: "LOW",
        summary: "Scored 2 dependencies.",
      });
      expect(queueState.dependencyScores).toEqual([
        {
          analysisResultId: "result-1",
          dependencyId: "dependency-1",
          score: 92,
          riskLevel: "LOW",
        },
        {
          analysisResultId: "result-1",
          dependencyId: "dependency-2",
          score: 87,
          riskLevel: "LOW",
        },
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
