import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, redisMock, getAnalysisQueueStatusMock } = vi.hoisted(() => ({
  prismaMock: {
    $queryRaw: vi.fn(),
  },
  redisMock: {
    ping: vi.fn(),
  },
  getAnalysisQueueStatusMock: vi.fn(),
}));

vi.mock("../../db/client", () => ({
  prisma: prismaMock,
}));

vi.mock("../../redis/client", () => ({
  redis: redisMock,
}));

vi.mock("../../queue/analysisQueue", () => ({
  enqueueAnalysisJob: vi.fn(),
  getAnalysisQueueStatus: getAnalysisQueueStatusMock,
}));

import { app } from "../../app";

describe("GET /queue/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns BullMQ counts and configured processing capacity", async () => {
    getAnalysisQueueStatusMock.mockResolvedValue({
      queue: "stackiq-analysis",
      capacity: {
        workerReplicas: 5,
        workerConcurrency: 2,
        maxConcurrentAnalyses: 10,
      },
      jobs: {
        waiting: 3,
        active: 10,
        completed: 25,
        failed: 1,
        delayed: 0,
        paused: 0,
      },
    });

    const response = await request(app).get("/queue/status");

    expect(response.status).toBe(200);
    expect(response.body.status.capacity.maxConcurrentAnalyses).toBe(10);
    expect(response.body.status.jobs.active).toBe(10);
  });
});
