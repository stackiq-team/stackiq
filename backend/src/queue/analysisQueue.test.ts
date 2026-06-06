import { describe, expect, it, vi } from "vitest";

const { queueAddMock, queueConstructorMock } = vi.hoisted(() => ({
  queueAddMock: vi.fn(),
  queueConstructorMock: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: vi.fn(function QueueMock(name, options) {
    queueConstructorMock(name, options);

    return {
      add: queueAddMock,
    };
  }),
}));

describe("analysisQueue", () => {
  it("configures retries for analysis jobs", async () => {
    const { ANALYSIS_QUEUE_NAME, DEFAULT_ANALYSIS_JOB_OPTIONS } = await import(
      "./analysisQueue"
    );

    expect(ANALYSIS_QUEUE_NAME).toBe("stackiq-analysis");
    expect(DEFAULT_ANALYSIS_JOB_OPTIONS).toMatchObject({
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });
    expect(queueConstructorMock).toHaveBeenCalledWith(
      "stackiq-analysis",
      expect.objectContaining({
        defaultJobOptions: DEFAULT_ANALYSIS_JOB_OPTIONS,
      })
    );
  });

  it("creates analysis jobs with the analysis id as job id", async () => {
    queueAddMock.mockResolvedValue({ id: "analysis-1" });

    const { enqueueAnalysisJob } = await import("./analysisQueue");

    await enqueueAnalysisJob({
      analysisId: "analysis-1",
    });

    expect(queueAddMock).toHaveBeenCalledWith(
      "run-analysis",
      {
        analysisId: "analysis-1",
      },
      {
        jobId: "analysis-1",
      }
    );
  });
});
