import { Queue } from "bullmq";
import {
  ANALYSIS_QUEUE_NAME,
  createRedisConnectionOptions,
  type AnalysisJobData,
} from "./config.js";

const analysisQueue = new Queue<AnalysisJobData, void, "run-analysis">(
  ANALYSIS_QUEUE_NAME,
  {
    connection: createRedisConnectionOptions(),
  }
);

export async function enqueueAnalysisJob(data: AnalysisJobData) {
  return analysisQueue.add("run-analysis", data, {
    jobId: data.analysisId,
  });
}

export async function closeAnalysisQueue() {
  await analysisQueue.close();
}
