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
});
