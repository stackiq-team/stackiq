export type AnalysisJobData = {
  analysisId: string;
  email?: string | null;
  owner?: string;
  repo?: string;
};

export const ANALYSIS_QUEUE_NAME =
  process.env.BULLMQ_QUEUE_NAME || "stackiq-analysis";

export function createRedisConnectionOptions() {
  const redisUrl = new URL(process.env.REDIS_URL || "redis://redis:6379");

  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username || undefined,
    password: redisUrl.password || undefined,
    maxRetriesPerRequest: null,
  };
}
