import { beforeEach, describe, expect, it, vi } from "vitest";

const { workerCtorMock, processAnalysisJobMock, startWeeklyRefreshSchedulerMock, refreshLeaderboardRepositoriesMock, closeAnalysisQueueMock, prismaMock } = vi.hoisted(() => ({
  workerCtorMock: vi.fn(),
  processAnalysisJobMock: vi.fn(),
  startWeeklyRefreshSchedulerMock: vi.fn(),
  refreshLeaderboardRepositoriesMock: vi.fn(),
  closeAnalysisQueueMock: vi.fn(),
  prismaMock: { $disconnect: vi.fn() },
}));

vi.mock("bullmq", () => ({
  Worker: class {
    constructor(...args: unknown[]) {
      workerCtorMock(...args);
      return {
        on: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
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

describe("worker entrypoint", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
    vi.resetModules();
    workerCtorMock.mockReset();
    processAnalysisJobMock.mockReset();
    startWeeklyRefreshSchedulerMock.mockReset();
    refreshLeaderboardRepositoriesMock.mockReset();
    closeAnalysisQueueMock.mockReset();
    prismaMock.$disconnect.mockReset();
  });

  it("boots the worker and schedulers when enabled", async () => {
    process.env.WORKER_PROCESS_JOBS = "true";
    process.env.WORKER_ENABLE_SCHEDULERS = "true";
    process.env.WORKER_CONCURRENCY = "3";

    startWeeklyRefreshSchedulerMock.mockReturnValue({ stop: vi.fn() });
    refreshLeaderboardRepositoriesMock.mockResolvedValue(undefined);

    await import("../index.js");

    expect(workerCtorMock).toHaveBeenCalled();
    expect(startWeeklyRefreshSchedulerMock).toHaveBeenCalledWith({
      prisma: prismaMock,
      logger: console,
    });
    expect(refreshLeaderboardRepositoriesMock).toHaveBeenCalledWith(prismaMock);
  });

  it("skips worker and schedulers when disabled", async () => {
    process.env.WORKER_PROCESS_JOBS = "false";
    process.env.WORKER_ENABLE_SCHEDULERS = "false";

    await import("../index.js");

    expect(workerCtorMock).not.toHaveBeenCalled();
    expect(startWeeklyRefreshSchedulerMock).not.toHaveBeenCalled();
    expect(refreshLeaderboardRepositoriesMock).not.toHaveBeenCalled();
  });
});