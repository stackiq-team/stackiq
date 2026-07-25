import { AnalysisStatus, DependencyType } from "@prisma/client";
import { enqueueAnalysisJob } from "./queue/analysisQueue.js";

type StackPayloadEntry = {
  name: string;
  versionRequirement: string;
};

type StackPayload = {
  dependencies: StackPayloadEntry[];
  devDependencies: StackPayloadEntry[];
};

type TopRequestedStack = {
  stackHash: string;
  stackPayload: unknown;
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

export async function refreshTopRequestedStacks(options: WeeklyRefreshOptions) {
  const logger = options.logger ?? console;
  const enqueue = options.enqueue ?? enqueueAnalysisJob;
  const topLimit = sanitizeTopLimit(options.topLimit ?? Number(process.env.WEEKLY_REFRESH_TOP_LIMIT ?? DEFAULT_TOP_LIMIT));

  const stacks = await options.prisma.$queryRaw<TopRequestedStack[]>`
    SELECT
      stack_hash AS "stackHash",
      stack_payload AS "stackPayload",
      request_count AS "requestCount"
    FROM stack_request_stats
    ORDER BY request_count DESC, updated_at DESC
    LIMIT ${topLimit}
  `;

  let enqueued = 0;

  for (const stack of stacks) {
    const stackPayload = parseStackPayload(stack.stackPayload);

    if (!stackPayload) {
      logger.warn(`[worker] Weekly refresh skipped malformed stack payload: hash=${stack.stackHash}`);
      continue;
    }

    const dependencyRecords = await buildDependencyRecordsFromStackPayload(
      stackPayload,
      logger
    );

    if (dependencyRecords.length === 0) {
      logger.warn(
        `[worker] Weekly refresh skipped empty stack payload: hash=${stack.stackHash}`
      );
      continue;
    }

    const analysis = await options.prisma.analysis.create({
      data: {
        status: AnalysisStatus.PENDING,
        dependencies: {
          create: dependencyRecords,
        },
      },
    });

    await enqueue({ analysisId: analysis.id });
    enqueued += 1;

    logger.log(
      `[worker] Weekly refresh queued analysis: analysisId=${analysis.id}, stackHash=${stack.stackHash}, dependencies=${dependencyRecords.length}, requestCount=${stack.requestCount}`
    );
  }

  logger.log(`[worker] Weekly refresh completed: enqueued=${enqueued}, requestedTop=${topLimit}`);

  return enqueued;
}

export function startWeeklyRefreshScheduler(
  options: WeeklyRefreshSchedulerOptions
): WeeklyRefreshScheduler {
  const logger = options.logger ?? console;
  const enabled = options.enabled ?? process.env.WEEKLY_REFRESH_ENABLED !== "false";

  if (!enabled) {
    logger.log("[worker] Weekly refresh scheduler is disabled.");
    return {
      triggerNow: async () => 0,
      stop: () => undefined,
    };
  }

  const intervalMs = sanitizeIntervalMs(
    options.intervalMs ?? Number(process.env.WEEKLY_REFRESH_INTERVAL_MS ?? DEFAULT_WEEKLY_INTERVAL_MS)
  );
  const runOnStart = options.runOnStart ?? process.env.WEEKLY_REFRESH_RUN_ON_START === "true";

  let isRunning = false;

  const run = async () => {
    if (isRunning) {
      logger.warn("[worker] Weekly refresh run skipped: previous run still in progress.");
      return 0;
    }

    isRunning = true;
    try {
      return await refreshTopRequestedStacks(options);
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

function parseStackPayload(payload: unknown): StackPayload | null {
  if (!payload || typeof payload !== "object") return null;

  const rawDependencies = (payload as { dependencies?: unknown }).dependencies;
  const rawDevDependencies = (payload as { devDependencies?: unknown }).devDependencies;

  const dependencies = normalizeStackEntries(rawDependencies);
  const devDependencies = normalizeStackEntries(rawDevDependencies);

  if (!dependencies || !devDependencies) return null;

  return {
    dependencies,
    devDependencies,
  };
}

function normalizeStackEntries(entries: unknown): StackPayloadEntry[] | null {
  if (!Array.isArray(entries)) return [];

  const normalized = entries
    .filter((entry): entry is StackPayloadEntry => {
      if (!entry || typeof entry !== "object") return false;
      const { name, versionRequirement } = entry as Record<string, unknown>;
      return typeof name === "string" && typeof versionRequirement === "string";
    })
    .map((entry) => ({
      name: entry.name,
      versionRequirement: entry.versionRequirement,
    }));

  return normalized;
}

async function buildDependencyRecordsFromStackPayload(
  payload: StackPayload,
  logger: Pick<Console, "warn">
) {
  const records: Array<{
    name: string;
    versionRequirement: string;
    type: DependencyType;
  }> = [];

  for (const dependency of payload.dependencies) {
    const latestVersion =
      (await fetchLatestNpmVersion(dependency.name, logger)) ?? dependency.versionRequirement;

    records.push({
      name: dependency.name,
      versionRequirement: latestVersion,
      type: DependencyType.DEPENDENCY,
    });
  }

  for (const dependency of payload.devDependencies) {
    const latestVersion =
      (await fetchLatestNpmVersion(dependency.name, logger)) ?? dependency.versionRequirement;

    records.push({
      name: dependency.name,
      versionRequirement: latestVersion,
      type: DependencyType.DEV_DEPENDENCY,
    });
  }

  return records;
}
