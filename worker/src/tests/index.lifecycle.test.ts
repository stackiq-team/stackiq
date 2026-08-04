import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  workerCtorMock,
  workerOnMock,
  workerCloseMock,
  processAnalysisJobMock,
  startWeeklyRefreshSchedulerMock,
  refreshLeaderboardRepositoriesMock,
  closeAnalysisQueueMock,
  prismaMock,
  schedulerStopMock,
} = vi.hoisted(() => ({
  workerCtorMock: vi.fn(),
  workerOnMock: vi.fn(),
  workerCloseMock: vi.fn().mockResolvedValue(undefined),
  processAnalysisJobMock: vi.fn(),
  startWeeklyRefreshSchedulerMock: vi.fn(),
  refreshLeaderboardRepositoriesMock: vi.fn(),
  closeAnalysisQueueMock: vi.fn().mockResolvedValue(undefined),
  prismaMock: { $disconnect: vi.fn().mockResolvedValue(undefined) },
  schedulerStopMock: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Worker: class {
    constructor(...args: unknown[]) {
      workerCtorMock(...args);
      return {
        on: workerOnMock,
        close: workerCloseMock,
      };
    }
  },
}));

vi.mock("../db/client.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../analysisProcessor.js", () => ({
  processAnalysisJob: processAnalysisJobMock,
}));

vi.mock("../weeklyRefresh.js", () => ({
  startWeeklyRefreshScheduler: startWeeklyRefreshSchedulerMock,
}));

vi.mock("../leaderboardSync.js", () => ({
  refreshLeaderboardRepositories: refreshLeaderboardRepositoriesMock,
}));

vi.mock("../queue/analysisQueue.js", () => ({
  closeAnalysisQueue: closeAnalysisQueueMock,
}));

describe("worker lifecycle hooks", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
    vi.clearAllMocks();
    vi.resetModules();

    process.env.WORKER_PROCESS_JOBS = "true";
    process.env.WORKER_ENABLE_SCHEDULERS = "true";
    startWeeklyRefreshSchedulerMock.mockReturnValue({ stop: schedulerStopMock });
    refreshLeaderboardRepositoriesMock.mockResolvedValue(undefined);
  });

  it("registers worker event handlers and executes graceful shutdown on SIGTERM", async () => {
    const processOnSpy = vi.spyOn(process, "on");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await import("../index.js");

    expect(workerOnMock).toHaveBeenCalledWith("ready", expect.any(Function));
    expect(workerOnMock).toHaveBeenCalledWith("completed", expect.any(Function));
    expect(workerOnMock).toHaveBeenCalledWith("failed", expect.any(Function));
    expect(workerOnMock).toHaveBeenCalledWith("error", expect.any(Function));

    const readyHandler = workerOnMock.mock.calls.find(([event]) => event === "ready")?.[1];
    const completedHandler = workerOnMock.mock.calls.find(([event]) => event === "completed")?.[1];
    const failedHandler = workerOnMock.mock.calls.find(([event]) => event === "failed")?.[1];
    const errorHandler = workerOnMock.mock.calls.find(([event]) => event === "error")?.[1];

    expect(readyHandler).toEqual(expect.any(Function));
    expect(completedHandler).toEqual(expect.any(Function));
    expect(failedHandler).toEqual(expect.any(Function));
    expect(errorHandler).toEqual(expect.any(Function));

    (readyHandler as () => void)();
    (completedHandler as (job: any) => void)({
      id: "job-1",
      data: { analysisId: "analysis-1" },
    });
    (failedHandler as (job: any, error: Error) => void)(
      { id: "job-2", data: { analysisId: "analysis-2" }, attemptsMade: 1 },
      new Error("boom")
    );
    (errorHandler as (error: Error) => void)(new Error("worker err"));

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Ready and waiting for jobs")
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Job completed: jobId=job-1")
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Job failed: jobId=job-2"),
    );
    expect(errorSpy).toHaveBeenCalledWith("[worker] Worker error:", expect.any(Error));

    const sigtermHandler = [...processOnSpy.mock.calls]
      .reverse()
      .find(([event]) => event === "SIGTERM")?.[1];
    expect(sigtermHandler).toEqual(expect.any(Function));

    await (sigtermHandler as () => Promise<void>)();

    expect(schedulerStopMock).toHaveBeenCalledTimes(1);
    expect(workerCloseMock).toHaveBeenCalledTimes(1);
    expect(closeAnalysisQueueMock).toHaveBeenCalledTimes(1);

    processOnSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("registers SIGINT shutdown handler", async () => {
    const processOnSpy = vi.spyOn(process, "on");

    await import("../index.js");

    const sigintHandler = [...processOnSpy.mock.calls]
      .reverse()
      .find(([event]) => event === "SIGINT")?.[1];
    expect(sigintHandler).toEqual(expect.any(Function));

    processOnSpy.mockRestore();
  });

  it("logs scheduler refresh failures without crashing boot", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    refreshLeaderboardRepositoriesMock.mockRejectedValueOnce(new Error("refresh failed"));

    await import("../index.js");
    await Promise.resolve();

    expect(errorSpy).toHaveBeenCalledWith(
      "[worker] Leaderboard refresh scheduler failed:",
      expect.any(Error)
    );

    errorSpy.mockRestore();
  });

  it("falls back to default worker concurrency for invalid env values", async () => {
    process.env.WORKER_CONCURRENCY = "0";

    await import("../index.js");

    expect(workerCtorMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
      expect.objectContaining({ concurrency: 1 })
    );
  });

  it("invokes processAnalysisJob through the worker processor callback", async () => {
    await import("../index.js");

    const processor = workerCtorMock.mock.calls[0]?.[1] as
      | ((job: any) => Promise<unknown>)
      | undefined;
    expect(processor).toEqual(expect.any(Function));

    const job = { id: "job-1", data: { analysisId: "analysis-1" }, attemptsMade: 0 };
    await processor?.(job);

    expect(processAnalysisJobMock).toHaveBeenCalledWith(job, { prisma: prismaMock });
  });

  it("handles shutdown failure path for SIGTERM", async () => {
    const processOnSpy = vi.spyOn(process, "on");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    workerCloseMock.mockRejectedValueOnce(new Error("close failed"));

    await import("../index.js");

    const sigtermHandler = [...processOnSpy.mock.calls]
      .reverse()
      .find(([event]) => event === "SIGTERM")?.[1] as (() => void) | undefined;
    expect(sigtermHandler).toEqual(expect.any(Function));

    sigtermHandler?.();
    await new Promise((resolve) => setImmediate(resolve));

    expect(errorSpy).toHaveBeenCalledWith("[worker] Shutdown error:", expect.any(Error));
    expect(exitSpy).toHaveBeenCalledWith(1);

    processOnSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
