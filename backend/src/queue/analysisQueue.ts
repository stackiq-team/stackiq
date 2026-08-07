import { Queue } from "bullmq";

export type AnalysisJobData = {
  analysisId: string;
  email?: string;
  owner?: string;
  repo?: string;
  source?: "USER_UPLOAD" | "USER_REPOSITORY" | "EXPLORE_REFRESH" | "WEEKLY_REFRESH";
};

export const ANALYSIS_QUEUE_NAME =
  process.env.BULLMQ_QUEUE_NAME || "stackiq-analysis";

export const DEFAULT_ANALYSIS_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: "exponential" as const,
    delay: 1000,
  },
  removeOnComplete: true,
  removeOnFail: false,
};

const USER_JOB_PRIORITY = 1;
const BACKGROUND_JOB_PRIORITY = 1000;

const redisUrl = new URL(process.env.REDIS_URL || "redis://redis:6379");

export const analysisQueue = new Queue<
  AnalysisJobData,
  void,
  "run-analysis"
>(ANALYSIS_QUEUE_NAME, {
  connection: {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username || undefined,
    password: redisUrl.password || undefined,
    maxRetriesPerRequest: null,
  },
  defaultJobOptions: DEFAULT_ANALYSIS_JOB_OPTIONS,
});

export async function enqueueAnalysisJob(data: AnalysisJobData) {
  const priority = isUserJob(data) ? USER_JOB_PRIORITY : BACKGROUND_JOB_PRIORITY;
  console.log(
    `[queue] Enqueuing analysis job: analysisId=${data.analysisId}, queue=${ANALYSIS_QUEUE_NAME}, source=${data.source ?? "USER_UPLOAD"}, priority=${priority}`
  );

  const job = await analysisQueue.add("run-analysis", data, {
    jobId: data.analysisId,
    priority,
  });

  console.log(
    `[queue] Analysis job enqueued: jobId=${job.id}, analysisId=${data.analysisId}, priority=${priority}`
  );

  return job;
}

export async function getAnalysisQueueStatus() {
  const counts = await analysisQueue.getJobCounts(
    "waiting",
    "active",
    "completed",
    "failed",
    "delayed",
    "paused"
  );
  const workerReplicas = positiveInteger(process.env.WORKER_REPLICAS, 5);
  const workerConcurrency = positiveInteger(process.env.WORKER_CONCURRENCY, 2);

  return {
    queue: ANALYSIS_QUEUE_NAME,
    capacity: {
      workerReplicas,
      workerConcurrency,
      maxConcurrentAnalyses: workerReplicas * workerConcurrency,
    },
    jobs: counts,
  };
}

function isUserJob(data: AnalysisJobData) {
  return !data.source || data.source === "USER_UPLOAD" || data.source === "USER_REPOSITORY";
}

function positiveInteger(value: string | number | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
