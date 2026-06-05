import { Queue } from "bullmq";

export type AnalysisJobData = {
  analysisId: string;
  stackId: string;
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
  console.log(
    `[queue] Enqueuing analysis job: analysisId=${data.analysisId}, stackId=${data.stackId}, queue=${ANALYSIS_QUEUE_NAME}`
  );

  const job = await analysisQueue.add("run-analysis", data, {
    jobId: data.analysisId,
  });

  console.log(
    `[queue] Analysis job enqueued: jobId=${job.id}, analysisId=${data.analysisId}`
  );

  return job;
}
