import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, enqueueAnalysisJobMock } = vi.hoisted(() => ({
  prismaMock: {
    analysis: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
  enqueueAnalysisJobMock: vi.fn(),
}));

vi.mock("../../db/client", () => ({
  prisma: prismaMock,
}));

vi.mock("../../redis/client", () => ({
  redis: {
    ping: vi.fn(),
  },
}));

vi.mock("../../queue/analysisQueue", () => ({
  enqueueAnalysisJob: enqueueAnalysisJobMock,
}));

vi.mock("https", () => ({
  request: vi.fn(),
}));

import { app } from "../../app";

const packageJsonText = JSON.stringify({
  name: "repo-test",
  version: "1.0.0",
  dependencies: {
    react: "^19.0.0",
  },
});

function mockHttpsRequest(responseBody: string, statusCode = 200) {
  const onDataCallbacks: Array<(chunk: string) => void> = [];
  const onEndCallbacks: Array<() => void> = [];
  const req = {
    on: vi.fn((event: string, callback: (...args: any[]) => void) => {
      if (event === "error") {
        return req;
      }
      return req;
    }),
    write: vi.fn(),
    end: vi.fn(() => {
      const res = {
        statusCode,
        on: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === "data") {
            onDataCallbacks.push(callback as (chunk: string) => void);
          }
          if (event === "end") {
            onEndCallbacks.push(callback as () => void);
          }
          return res;
        }),
      };
      process.nextTick(() => {
        onDataCallbacks.forEach((cb) => cb(responseBody));
        onEndCallbacks.forEach((cb) => cb());
      });
    }),
  };
  return req;
}

describe("POST /analyses/repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an analysis from owner/repo package.json and enqueues a job", async () => {
    const httpsModule = await import("https");
    const mockReq = mockHttpsRequest(
      JSON.stringify({
        data: {
          repository: {
            object: {
              text: packageJsonText,
            },
          },
        },
      })
    );

    vi.mocked(httpsModule.request).mockReturnValue(mockReq as any);

    prismaMock.analysis.create.mockResolvedValue({
      id: "analysis-1",
      email: null,
      status: "PENDING",
      resultToken: "result-token-1",
      errorMessage: null,
      dependencies: [
        {
          id: "dependency-1",
          analysisId: "analysis-1",
          name: "react",
          versionRequirement: "^19.0.0",
          type: "DEPENDENCY",
        },
      ],
    });

    enqueueAnalysisJobMock.mockResolvedValue({ id: "analysis-1" });

    const response = await request(app)
      .post("/analyses/repository")
      .send({ owner: "facebook", repo: "react" });

    expect(response.statusCode).toBe(200);
    expect(response.body.message).toBe("Success");
    expect(response.body.analysis.resultToken).toBe("result-token-1");
    expect(prismaMock.analysis.create).toHaveBeenCalledWith({
      data: {
        email: null,
        status: "PENDING",
        dependencies: {
          create: [
            {
              name: "react",
              versionRequirement: "^19.0.0",
              type: "DEPENDENCY",
            },
          ],
        },
      },
      include: {
        dependencies: true,
      },
    });
    expect(enqueueAnalysisJobMock).toHaveBeenCalledWith({
      analysisId: "analysis-1",
      email: undefined,
    });
  });
});
