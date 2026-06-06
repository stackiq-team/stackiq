import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, enqueueAnalysisJobMock } = vi.hoisted(() => ({
  prismaMock: {
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

describe("POST /analyses", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.analysis.create.mockResolvedValue({
      id: "analysis-1",
      email: "test@example.com",
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
        {
          id: "dependency-2",
          analysisId: "analysis-1",
          name: "@eslint/js",
          versionRequirement: "^10.0.1",
          type: "DEV_DEPENDENCY",
        },
      ],
    });

    enqueueAnalysisJobMock.mockResolvedValue({ id: "analysis-1" });
  });

  it("creates a pending analysis with dependencies and enqueues it", async () => {
    const response = await request(app)
      .post("/analyses")
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
    expect(response.body.analysis).toMatchObject({
      id: "analysis-1",
      email: "test@example.com",
      status: "PENDING",
      resultToken: "result-token-1",
    });

    expect(prismaMock.analysis.create).toHaveBeenCalledWith({
      data: {
        email: "test@example.com",
        status: "PENDING",
        dependencies: {
          create: [
            {
              name: "react",
              versionRequirement: "^19.0.0",
              type: "DEPENDENCY",
            },
            {
              name: "@eslint/js",
              versionRequirement: "^10.0.1",
              type: "DEV_DEPENDENCY",
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
    });
  });

  it("rejects a package file with no dependencies", async () => {
    const response = await request(app)
      .post("/analyses")
      .field("email", "test@example.com")
      .attach(
        "file",
        Buffer.from(
          JSON.stringify({
            name: "empty",
            version: "0.0.0",
          })
        ),
        "stack.json"
      );

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe(
      "package.json must contain dependencies or devDependencies."
    );
    expect(prismaMock.analysis.create).not.toHaveBeenCalled();
    expect(enqueueAnalysisJobMock).not.toHaveBeenCalled();
  });
});
