import { AnalysisStatus, DependencyType } from "@prisma/client";
import { enqueueAnalysisJob } from "./queue/analysisQueue.js";

type TopRequestedDependency = {
  dependencyName: string;
  dependencyType: string;
  lastVersionRequirement: string;
  requestCount: number;
};

type WeeklyRefreshPrisma = {
  $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
  analysis: {
    create: (args: {
      data: {
        status: AnalysisStatus;
        dependencies: {
          create: Array<{
            name: string;
            versionRequirement: string;
            type: DependencyType;
          }>;
        };
      };
    }) => Promise<{ id: string }>;
  };
};

type WeeklyRefreshOptions = {
  prisma: WeeklyRefreshPrisma;
  logger?: Pick<Console, "log" | "warn" | "error">;
  topLimit?: number;
  enqueue?: typeof enqueueAnalysisJob;
};

type WeeklyRefreshSchedulerOptions = WeeklyRefreshOptions & {
  intervalMs?: number;
  runOnStart?: boolean;
  enabled?: boolean;
};

type WeeklyRefreshScheduler = {
  triggerNow: () => Promise<number>;
  stop: () => void;
};

const DEFAULT_TOP_LIMIT = 10;
const DEFAULT_WEEKLY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export async function refreshTopRequestedDependencies(options: WeeklyRefreshOptions) {
  const logger = options.logger ?? console;
  const enqueue = options.enqueue ?? enqueueAnalysisJob;
  const topLimit = sanitizeTopLimit(options.topLimit ?? Number(process.env.DEPENDENCY_SYNC_TOP_LIMIT ?? DEFAULT_TOP_LIMIT));

  const dependencies = await options.prisma.$queryRaw<TopRequestedDependency[]>`
    SELECT
      dependency_name AS "dependencyName",
      dependency_type::text AS "dependencyType",
      last_version_requirement AS "lastVersionRequirement",
      request_count AS "requestCount"
    FROM dependency_request_stats
    ORDER BY request_count DESC, updated_at DESC
    LIMIT ${topLimit}
  `;

  if (dependencies.length === 0) {
    logger.log("[worker] Weekly refresh found no requested dependencies to rescan.");
  } else {
    logger.log(
      `[worker] Weekly refresh selected dependencies: ${dependencies
        .map(
          (dependency) =>
            `${dependency.dependencyName}:${dependency.dependencyType}(requests=${dependency.requestCount})`
        )
        .join(", ")}`
    );
  }

  let enqueued = 0;

  for (const dependency of dependencies) {
    const dependencyType = toDependencyType(dependency.dependencyType);

    if (!dependencyType) {
      logger.warn(
        `[worker] Weekly refresh skipped dependency with invalid type: ${dependency.dependencyName} (${dependency.dependencyType})`
      );
      continue;
    }

    const latestVersion =
      (await fetchLatestNpmVersion(dependency.dependencyName, logger)) ??
      dependency.lastVersionRequirement;

    logger.log(
      `[worker] Weekly refresh rescanning dependency: name=${dependency.dependencyName}, type=${dependencyType}, requestCount=${dependency.requestCount}, version=${latestVersion}`
    );

    const analysis = await options.prisma.analysis.create({
      data: {
        status: AnalysisStatus.PENDING,
        dependencies: {
          create: [
            {
              name: dependency.dependencyName,
              versionRequirement: latestVersion,
              type: dependencyType,
            },
          ],
        },
      },
    });

    await enqueue({ analysisId: analysis.id });
    enqueued += 1;

    logger.log(
      `[worker] Weekly refresh queued analysis: analysisId=${analysis.id}, dependency=${dependency.dependencyName}, type=${dependencyType}, requestCount=${dependency.requestCount}`
    );
  }

  logger.log(`[worker] Weekly refresh completed: enqueued=${enqueued}, requestedTop=${topLimit}`);

  return enqueued;
}

export function startWeeklyRefreshScheduler(
  options: WeeklyRefreshSchedulerOptions
): WeeklyRefreshScheduler {
  const logger = options.logger ?? console;
  const enabled = options.enabled ?? process.env.DEPENDENCY_SYNC_ENABLED !== "false";

  if (!enabled) {
    logger.log("[worker] Weekly refresh scheduler is disabled.");
    return {
      triggerNow: async () => 0,
      stop: () => undefined,
    };
  }

  const intervalMs = sanitizeIntervalMs(
    options.intervalMs ?? Number(process.env.DEPENDENCY_SYNC_INTERVAL_MS ?? DEFAULT_WEEKLY_INTERVAL_MS)
  );
  const runOnStart = options.runOnStart ?? process.env.DEPENDENCY_SYNC_RUN_ON_START === "true";

  let isRunning = false;

  const run = async () => {
    if (isRunning) {
      logger.warn("[worker] Weekly refresh run skipped: previous run still in progress.");
      return 0;
    }

    isRunning = true;
    try {
      return await refreshTopRequestedDependencies(options);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown weekly refresh error";
      logger.error(`[worker] Weekly refresh failed: ${message}`);
      return 0;
    } finally {
      isRunning = false;
    }
  };

  const timer = setInterval(() => {
    void run();
  }, intervalMs);
  timer.unref();

  logger.log(`[worker] Weekly refresh scheduler started: intervalMs=${intervalMs}`);

  if (runOnStart) {
    void run();
  }

  return {
    triggerNow: run,
    stop: () => {
      clearInterval(timer);
      logger.log("[worker] Weekly refresh scheduler stopped.");
    },
  };
}

function sanitizeTopLimit(value: number) {
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_TOP_LIMIT;
  return Math.floor(value);
}

function sanitizeIntervalMs(value: number) {
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_WEEKLY_INTERVAL_MS;
  return Math.floor(value);
}

function toDependencyType(value: string) {
  if (value === DependencyType.DEPENDENCY) return DependencyType.DEPENDENCY;
  if (value === DependencyType.DEV_DEPENDENCY) return DependencyType.DEV_DEPENDENCY;
  return null;
}

async function fetchLatestNpmVersion(
  packageName: string,
  logger: Pick<Console, "warn">
): Promise<string | null> {
  const packageUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName).replace(/^%40/, "@")}`;

  try {
    const response = await fetch(packageUrl);

    if (!response.ok) {
      logger.warn(
        `[worker] Weekly refresh could not fetch npm metadata for ${packageName}: status=${response.status}`
      );
      return null;
    }

    const payload = (await response.json()) as {
      "dist-tags"?: {
        latest?: string;
      };
    };

    return payload["dist-tags"]?.latest ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown npm metadata error";
    logger.warn(
      `[worker] Weekly refresh could not fetch npm metadata for ${packageName}: ${message}`
    );
    return null;
  }
}
