import { AnalysisStatus } from "@prisma/client";
import type { Job } from "bullmq";
import type { AnalysisJobData } from "./queue/config.js";

type AnalysisResultData = {
  globalScore: number;
  riskLevel: string;
  summary: string;
};

type AnalysisRepository = {
  analysis: {
    findUnique(args: { where: { id: string } }): Promise<{ id: string } | null>;
    update(args: {
      where: { id: string };
      data: {
        status: AnalysisStatus;
        errorMessage?: string | null;
      };
    }): Promise<unknown>;
  };
  analysisResult: {
    upsert(args: {
      where: { analysisId: string };
      create: AnalysisResultData & { analysisId: string };
      update: AnalysisResultData;
    }): Promise<unknown>;
  };
};

type ProcessorOptions = {
  prisma: AnalysisRepository;
  runAnalysis?: (data: AnalysisJobData) => Promise<AnalysisResultData>;
  logger?: Pick<Console, "log" | "error">;
};

export async function processAnalysisJob(
  job: Pick<Job<AnalysisJobData>, "id" | "data" | "attemptsMade">,
  options: ProcessorOptions
) {
  const { prisma, runAnalysis = defaultRunAnalysis, logger = console } = options;
  const { analysisId, stackId } = job.data;

  logger.log(
    `[worker] Job received: jobId=${job.id ?? analysisId}, analysisId=${analysisId}, stackId=${stackId}, attemptsMade=${job.attemptsMade}`
  );

  logger.log(`[worker] Loading analysis: analysisId=${analysisId}`);

  const analysis = await prisma.analysis.findUnique({
    where: { id: analysisId },
  });

  if (!analysis) {
    logger.error(`[worker] Analysis not found: analysisId=${analysisId}`);
    throw new Error(`Analysis ${analysisId} was not found`);
  }

  logger.log(`[worker] Updating analysis to PROCESSING: analysisId=${analysisId}`);

  await prisma.analysis.update({
    where: { id: analysisId },
    data: {
      status: AnalysisStatus.PROCESSING,
      errorMessage: null,
    },
  });
  logger.log(`[worker] Analysis status updated: analysisId=${analysisId}, status=PROCESSING`);

  try {
    logger.log(`[worker] Analysis processing started: analysisId=${analysisId}`);

    const result = await runAnalysis({ analysisId, stackId });

    logger.log(
      `[worker] Saving analysis result: analysisId=${analysisId}, globalScore=${result.globalScore}, riskLevel=${result.riskLevel}`
    );

    await prisma.analysisResult.upsert({
      where: { analysisId },
      create: {
        analysisId,
        ...result,
      },
      update: result,
    });

    logger.log(`[worker] Analysis result saved: analysisId=${analysisId}`);

    logger.log(`[worker] Updating analysis to COMPLETED: analysisId=${analysisId}`);

    await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        status: AnalysisStatus.COMPLETED,
        errorMessage: null,
      },
    });
    logger.log(`[worker] Analysis status updated: analysisId=${analysisId}, status=COMPLETED`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker error";

    logger.error(
      `[worker] Analysis processing failed: analysisId=${analysisId}, error=${message}`
    );
    logger.log(`[worker] Updating analysis to FAILED: analysisId=${analysisId}`);

    await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        status: AnalysisStatus.FAILED,
        errorMessage: message,
      },
    });

    logger.error(
      `[worker] Analysis status updated: analysisId=${analysisId}, status=FAILED, error=${message}`
    );
    throw error;
  }
}

async function defaultRunAnalysis(_data: AnalysisJobData): Promise<AnalysisResultData> {
  return {
    globalScore: 100,
    riskLevel: "LOW",
    summary: "Minimal analysis completed successfully.",
  };
}
