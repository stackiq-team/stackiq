import { describe, expect, it, vi, afterEach } from "vitest";
import { AnalysisStatus, DependencyType } from "@prisma/client";
import {
  refreshTopRequestedDependencies,
  startWeeklyRefreshScheduler,
} from "../weeklyRefresh.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("refreshTopRequestedDependencies", () => {
  it("returns 0 when no dependency stats are available", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      analysis: {
        create: vi.fn(),
      },
    };

    const enqueue = vi.fn();
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const enqueued = await refreshTopRequestedDependencies({
      prisma: prisma as any,
      enqueue: enqueue as any,
      logger,
      topLimit: 10,
    });

    expect(enqueued).toBe(0);
    expect(prisma.analysis.create).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      "[worker] Weekly refresh found no requested dependencies to rescan."
    );
  });

  it("queues analyses for top requested dependencies and upgrades versions when available", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          dependencyName: "react",
          dependencyType: "DEPENDENCY",
          lastVersionRequirement: "^19.0.0",
          requestCount: 25,
        },
        {
          dependencyName: "vite",
          dependencyType: "DEV_DEPENDENCY",
          lastVersionRequirement: "^5.0.0",
          requestCount: 17,
        },
      ]),
      analysis: {
        create: vi
          .fn()
          .mockResolvedValueOnce({ id: "analysis-1" })
          .mockResolvedValueOnce({ id: "analysis-2" }),
      },
    };

    const enqueue = vi.fn().mockResolvedValue({ id: "analysis-1" });
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ "dist-tags": { latest: "19.1.0" } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ "dist-tags": { latest: "7.0.0" } }),
        })
    );

    const enqueued = await refreshTopRequestedDependencies({
      prisma: prisma as any,
      enqueue,
      logger,
      topLimit: 10,
    });

    expect(enqueued).toBe(2);
    expect(prisma.analysis.create).toHaveBeenNthCalledWith(1, {
      data: {
        status: AnalysisStatus.PENDING,
        dependencies: {
          create: [
            {
              name: "react",
              versionRequirement: "19.1.0",
              type: DependencyType.DEPENDENCY,
            },
          ],
        },
      },
    });
    expect(prisma.analysis.create).toHaveBeenNthCalledWith(2, {
      data: {
        status: AnalysisStatus.PENDING,
        dependencies: {
          create: [
            {
              name: "vite",
              versionRequirement: "7.0.0",
              type: DependencyType.DEV_DEPENDENCY,
            },
          ],
        },
      },
    });
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it("falls back to last requested version when npm latest fetch fails", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          dependencyName: "axios",
          dependencyType: "DEPENDENCY",
          lastVersionRequirement: "^1.9.0",
          requestCount: 7,
        },
      ]),
      analysis: {
        create: vi.fn().mockResolvedValue({ id: "analysis-fallback" }),
      },
    };

    const enqueue = vi.fn().mockResolvedValue({ id: "analysis-fallback" });
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({}),
      })
    );

    const enqueued = await refreshTopRequestedDependencies({
      prisma: prisma as any,
      enqueue,
      logger,
      topLimit: 10,
    });

    expect(enqueued).toBe(1);
    expect(prisma.analysis.create).toHaveBeenCalledWith({
      data: {
        status: AnalysisStatus.PENDING,
        dependencies: {
          create: [
            {
              name: "axios",
              versionRequirement: "^1.9.0",
              type: DependencyType.DEPENDENCY,
            },
          ],
        },
      },
    });
    expect(logger.warn).toHaveBeenCalledWith(
      "[worker] Weekly refresh could not fetch npm metadata for axios: status=503"
    );
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("skips dependencies with invalid types", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          dependencyName: "react",
          dependencyType: "INVALID",
          lastVersionRequirement: "^19.0.0",
          requestCount: 25,
        },
      ]),
      analysis: {
        create: vi.fn(),
      },
    };

    const enqueue = vi.fn();
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const enqueued = await refreshTopRequestedDependencies({
      prisma: prisma as any,
      enqueue: enqueue as any,
      logger,
    });

    expect(enqueued).toBe(0);
    expect(prisma.analysis.create).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("falls back to default top limit when configured limit is invalid", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      analysis: {
        create: vi.fn(),
      },
    };

    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    await refreshTopRequestedDependencies({
      prisma: prisma as any,
      logger,
      topLimit: -7,
    });

    const topLimitArg = prisma.$queryRaw.mock.calls[0]?.[1];
    expect(topLimitArg).toBe(10);
  });

  it("falls back to last requested version when npm metadata has no latest tag", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          dependencyName: "msw",
          dependencyType: "DEV_DEPENDENCY",
          lastVersionRequirement: "^2.0.0",
          requestCount: 3,
        },
      ]),
      analysis: {
        create: vi.fn().mockResolvedValue({ id: "analysis-msw" }),
      },
    };

    const enqueue = vi.fn().mockResolvedValue({ id: "analysis-msw" });
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ "dist-tags": {} }),
      })
    );

    await refreshTopRequestedDependencies({
      prisma: prisma as any,
      enqueue,
      logger,
      topLimit: 10,
    });

    expect(prisma.analysis.create).toHaveBeenCalledWith({
      data: {
        status: AnalysisStatus.PENDING,
        dependencies: {
          create: [
            {
              name: "msw",
              versionRequirement: "^2.0.0",
              type: DependencyType.DEV_DEPENDENCY,
            },
          ],
        },
      },
    });
  });

  it("falls back to last requested version when npm fetch throws", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          dependencyName: "zod",
          dependencyType: "DEPENDENCY",
          lastVersionRequirement: "^3.0.0",
          requestCount: 8,
        },
      ]),
      analysis: {
        create: vi.fn().mockResolvedValue({ id: "analysis-zod" }),
      },
    };

    const enqueue = vi.fn().mockResolvedValue({ id: "analysis-zod" });
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("network down"));

    await refreshTopRequestedDependencies({
      prisma: prisma as any,
      enqueue,
      logger,
      topLimit: 10,
    });

    expect(prisma.analysis.create).toHaveBeenCalledWith({
      data: {
        status: AnalysisStatus.PENDING,
        dependencies: {
          create: [
            {
              name: "zod",
              versionRequirement: "^3.0.0",
              type: DependencyType.DEPENDENCY,
            },
          ],
        },
      },
    });
    expect(logger.warn).toHaveBeenCalledWith(
      "[worker] Weekly refresh could not fetch npm metadata for zod: Unknown npm metadata error"
    );
  });
});

describe("startWeeklyRefreshScheduler", () => {
  it("does not schedule when disabled", async () => {
    const scheduler = startWeeklyRefreshScheduler({
      prisma: {
        $queryRaw: vi.fn(),
        analysis: {
          create: vi.fn(),
        },
      } as any,
      enabled: false,
      logger: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const enqueued = await scheduler.triggerNow();

    expect(enqueued).toBe(0);
    scheduler.stop();
  });

  it("returns 0 and logs an error when a scheduled run fails", async () => {
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const scheduler = startWeeklyRefreshScheduler({
      prisma: {
        $queryRaw: vi.fn().mockRejectedValue(new Error("db unavailable")),
        analysis: {
          create: vi.fn(),
        },
      } as any,
      enabled: true,
      intervalMs: 60_000,
      logger,
    });

    const enqueued = await scheduler.triggerNow();

    expect(enqueued).toBe(0);
    expect(logger.error).toHaveBeenCalledWith(
      "[worker] Weekly refresh failed: db unavailable"
    );

    scheduler.stop();
  });

  it("triggers one immediate run when configured to run on start", async () => {
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const scheduler = startWeeklyRefreshScheduler({
      prisma: {
        $queryRaw: vi.fn().mockResolvedValue([]),
        analysis: {
          create: vi.fn(),
        },
      } as any,
      enabled: true,
      runOnStart: true,
      intervalMs: 0,
      logger,
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(logger.log).toHaveBeenCalledWith(
      "[worker] Weekly refresh found no requested dependencies to rescan."
    );
    expect(logger.log).toHaveBeenCalledWith(
      `[worker] Weekly refresh scheduler started: intervalMs=${7 * 24 * 60 * 60 * 1000}`
    );

    scheduler.stop();
  });

  it("skips overlapping runs while a previous run is still in progress", async () => {
    let releaseQuery: (() => void) | null = null;
    const queryPromise = new Promise<unknown[]>((resolve) => {
      releaseQuery = () => resolve([]);
    });

    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const scheduler = startWeeklyRefreshScheduler({
      prisma: {
        $queryRaw: vi.fn().mockReturnValue(queryPromise),
        analysis: {
          create: vi.fn(),
        },
      } as any,
      enabled: true,
      intervalMs: 60_000,
      logger,
    });

    const firstRun = scheduler.triggerNow();
    const secondRun = await scheduler.triggerNow();

    expect(secondRun).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(
      "[worker] Weekly refresh run skipped: previous run still in progress."
    );

    releaseQuery?.();
    await firstRun;
    scheduler.stop();
  });

  it("executes interval callback for scheduled runs", async () => {
    vi.useFakeTimers();

    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      analysis: {
        create: vi.fn(),
      },
    };

    const scheduler = startWeeklyRefreshScheduler({
      prisma: prisma as any,
      enabled: true,
      intervalMs: 50,
      logger,
    });

    await vi.advanceTimersByTimeAsync(60);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);

    scheduler.stop();
    vi.useRealTimers();
  });
});
