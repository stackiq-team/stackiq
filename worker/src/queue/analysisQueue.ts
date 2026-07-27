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

const USER_JOB_PRIORITY = 1;
const BACKGROUND_JOB_PRIORITY = 1000;

export async function enqueueAnalysisJob(data: AnalysisJobData) {
  const priority = isUserJob(data) ? USER_JOB_PRIORITY : BACKGROUND_JOB_PRIORITY;
  return analysisQueue.add("run-analysis", data, {
    jobId: data.analysisId,
    priority,
  });
}

export async function closeAnalysisQueue() {
  await analysisQueue.close();
}

function isUserJob(data: AnalysisJobData) {
  return !data.source || data.source === "USER_UPLOAD" || data.source === "USER_REPOSITORY";
}
