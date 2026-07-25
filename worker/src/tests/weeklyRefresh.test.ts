import { describe, expect, it, vi, afterEach } from "vitest";
import { AnalysisStatus, DependencyType } from "@prisma/client";
import {
  refreshTopRequestedStacks,
  startWeeklyRefreshScheduler,
} from "../weeklyRefresh.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("refreshTopRequestedStacks", () => {
  it("queues analyses for top requested stacks and upgrades versions when available", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          stackHash: "stack-1",
          stackPayload: {
            dependencies: [
              {
                name: "react",
                versionRequirement: "^19.0.0",
              },
            ],
            devDependencies: [
              {
                name: "vite",
                versionRequirement: "^5.0.0",
              },
            ],
          },
          requestCount: 17,
        },
      ]),
      analysis: {
        create: vi
          .fn()
          .mockResolvedValueOnce({ id: "analysis-1" }),
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

    const enqueued = await refreshTopRequestedStacks({
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
              name: "react",
              versionRequirement: "19.1.0",
              type: DependencyType.DEPENDENCY,
            },
            {
              name: "vite",
              versionRequirement: "7.0.0",
              type: DependencyType.DEV_DEPENDENCY,
            },
          ],
        },
      },
    });
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("skips malformed stack payloads", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          stackHash: "stack-1",
          stackPayload: {
            dependencies: "invalid",
            devDependencies: [],
          },
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

    const enqueued = await refreshTopRequestedStacks({
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
