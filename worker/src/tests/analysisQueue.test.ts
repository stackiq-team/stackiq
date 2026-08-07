import { describe, expect, it, vi, beforeEach } from "vitest";

const { addMock, closeMock } = vi.hoisted(() => ({
  addMock: vi.fn(),
  closeMock: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: class {
    add = addMock;
    close = closeMock;
  },
}));

vi.mock("../queue/config.js", () => ({
  ANALYSIS_QUEUE_NAME: "stackiq-analysis",
  createRedisConnectionOptions: vi.fn().mockReturnValue({ host: "redis", port: 6379 }),
}));

import { enqueueAnalysisJob, closeAnalysisQueue } from "../queue/analysisQueue.js";

describe("analysisQueue", () => {
  beforeEach(() => {
    addMock.mockReset();
    closeMock.mockReset();
  });

  it("enqueues user jobs with user priority", async () => {
    addMock.mockResolvedValueOnce(undefined);

    await enqueueAnalysisJob({
      analysisId: "analysis-1",
      email: "user@example.com",
      source: "USER_UPLOAD",
    });

    expect(addMock).toHaveBeenCalledWith(
      "run-analysis",
      expect.objectContaining({ analysisId: "analysis-1" }),
      expect.objectContaining({
        jobId: "analysis-1",
        priority: 1,
      })
    );
  });

  it("enqueues background jobs with background priority", async () => {
    addMock.mockResolvedValueOnce(undefined);

    await enqueueAnalysisJob({
      analysisId: "analysis-2",
      source: "WEEKLY_REFRESH",
    });

    expect(addMock).toHaveBeenCalledWith(
      "run-analysis",
      expect.objectContaining({ analysisId: "analysis-2" }),
      expect.objectContaining({
        jobId: "analysis-2",
        priority: 1000,
      })
    );
  });

  it("closes the queue", async () => {
    closeMock.mockResolvedValueOnce(undefined);

    await closeAnalysisQueue();

    expect(closeMock).toHaveBeenCalledTimes(1);
  });
});