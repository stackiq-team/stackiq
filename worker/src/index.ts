import "dotenv/config";
import { Worker } from "bullmq";
import { prisma } from "./db/client.js";
import { processAnalysisJob } from "./analysisProcessor.js";
import {
  ANALYSIS_QUEUE_NAME,
  createRedisConnectionOptions,
  type AnalysisJobData,
} from "./queue/config.js";
import { refreshLeaderboardRepositories } from "./leaderboardSync.js";

const connection = createRedisConnectionOptions();

console.log(
  `[worker] Booting worker: queue=${ANALYSIS_QUEUE_NAME}, concurrency=2`
);

const worker = new Worker<AnalysisJobData>(
  ANALYSIS_QUEUE_NAME,
  async (job) => processAnalysisJob(job, { prisma }),
  {
    connection,
    concurrency: 2,
  }
);

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
  await worker.close();
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
