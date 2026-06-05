import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, enqueueAnalysisJobMock } = vi.hoisted(() => ({
  prismaMock: {
    stack: {
      create: vi.fn(),
    },
    analysis: {
      create: vi.fn(),
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

import { app } from "../../app";

describe("POST /stack/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.stack.create.mockResolvedValue({
      id: "stack-1",
      name: "test@example.com",
      dependencies: [
        {
          id: "dependency-1",
          name: "react",
          versionRequirement: "^19.0.0",
          type: "DEPENDENCY",
        },
        {
          id: "dependency-2",
          name: "@eslint/js",
          versionRequirement: "^10.0.1",
          type: "DEV_DEPENDENCY",
        },
      ],
    });

    prismaMock.analysis.create.mockResolvedValue({
      id: "analysis-1",
      stackId: "stack-1",
      status: "PENDING",
      resultToken: "result-token-1",
      errorMessage: null,
    });

    enqueueAnalysisJobMock.mockResolvedValue({ id: "analysis-1" });
  });

  it("creates a stack, creates a PENDING analysis, and enqueues an analysis job", async () => {
    const response = await request(app)
      .post("/stack/create")
      .field("email", "test@example.com")
      .attach(
        "file",
        Buffer.from(
          JSON.stringify({
            name: "frontend",
            version: "0.0.0",
            dependencies: {
              react: "^19.0.0",
            },
            devDependencies: {
              "@eslint/js": "^10.0.1",
            },
          })
        ),
        "stack.json"
      );

    expect(response.statusCode).toBe(200);
    expect(response.body.message).toBe("Success");
    expect(response.body.stack).toMatchObject({
      id: "stack-1",
      name: "test@example.com",
    });
    expect(response.body.analysis).toMatchObject({
      id: "analysis-1",
      stackId: "stack-1",
      status: "PENDING",
    });

    expect(prismaMock.stack.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "test@example.com",
        }),
        include: {
          dependencies: true,
        },
      })
    );
    expect(prismaMock.analysis.create).toHaveBeenCalledWith({
      data: {
        stackId: "stack-1",
        status: "PENDING",
      },
    });
    expect(enqueueAnalysisJobMock).toHaveBeenCalledWith({
      analysisId: "analysis-1",
      stackId: "stack-1",
    });
  });
});
