import "dotenv/config";
import { Worker } from "bullmq";
import { prisma } from "./db/client.js";
import { processAnalysisJob } from "./analysisProcessor.js";
import {
  ANALYSIS_QUEUE_NAME,
  createRedisConnectionOptions,
  type AnalysisJobData,
} from "./queue/config.js";
import { closeAnalysisQueue } from "./queue/analysisQueue.js";
import { startWeeklyRefreshScheduler } from "./weeklyRefresh.js";
import { refreshLeaderboardRepositories } from "./leaderboardSync.js";

const connection = createRedisConnectionOptions();
const workerConcurrency = 2;

console.log(
  `[worker] Booting worker: queue=${ANALYSIS_QUEUE_NAME}, concurrency=${workerConcurrency}, envWorkerConcurrency=${process.env.WORKER_CONCURRENCY ?? "unset"}`
);
console.log(
  `[worker] Feature config: relationships=${process.env.DEPENDENCY_RELATIONSHIPS_ENABLED ?? "true"}, relationshipMaxPairs=${process.env.DEPENDENCY_RELATIONSHIP_MAX_PAIRS ?? "30"}, relationshipSearchResults=${process.env.DEPENDENCY_RELATIONSHIP_SEARCH_RESULTS ?? "3"}, relationshipCacheTtlDays=${process.env.DEPENDENCY_RELATIONSHIP_CACHE_TTL_DAYS ?? "14"}`
);

const worker = new Worker<AnalysisJobData>(
  ANALYSIS_QUEUE_NAME,
  async (job) => processAnalysisJob(job, { prisma }),
  {
    connection,
    concurrency: workerConcurrency,
  }
);

const weeklyRefreshScheduler = startWeeklyRefreshScheduler({
  prisma,
  logger: console,
});

refreshLeaderboardRepositories(prisma).catch((error) => {
  console.error("[worker] Leaderboard refresh scheduler failed:", error);

});

worker.on("ready", () => {
  console.log(`[worker] Ready and waiting for jobs: queue=${ANALYSIS_QUEUE_NAME}`);
});

worker.on("completed", (job) => {
  console.log(
    `[worker] Job completed: jobId=${job.id}, analysisId=${job.data.analysisId}`
  );
});

worker.on("failed", (job, error) => {
  console.error(
    `[worker] Job failed: jobId=${job?.id ?? "unknown"}, analysisId=${
      job?.data.analysisId ?? "unknown"
    }, attemptsMade=${
      job?.attemptsMade ?? 0
    }, error=${error.message}`
  );
});

worker.on("error", (error) => {
  console.error("[worker] Worker error:", error);
});

async function shutdown() {
  console.log("[worker] Shutting down...");
  weeklyRefreshScheduler.stop();
  await worker.close();
  await closeAnalysisQueue();
  await prisma.$disconnect();
  console.log("[worker] Shutdown complete");
}

process.on("SIGTERM", () => {
  shutdown().catch((error) => {
    console.error("[worker] Shutdown error:", error);
    process.exit(1);
  });
});

process.on("SIGINT", () => {
  shutdown().catch((error) => {
    console.error("[worker] Shutdown error:", error);
    process.exit(1);
  });
});
