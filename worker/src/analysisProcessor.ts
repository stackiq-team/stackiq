import { AnalysisStatus } from "@prisma/client";
import type { Job } from "bullmq";
import type { AnalysisJobData } from "./queue/config.js";
import {
  scoreDependencies,
  type DependencyInput,
} from "./dependencyScore.js";
import { fetchGitHubMinerData } from "./adapters/githubMinerAdapter.js";
import type { GitHubMinerInput, GitHubMinerOutput } from "./types/githubMinerType.js";

type AnalysisResultData = {
  globalScore: number;
  riskLevel: string;
  summary: string;
  dependencyScores?: DependencyScoreData[];
};

type DependencyScoreData = {
  dependencyId: string;
  score: number;
  riskLevel: string;
};

type AnalysisRepository = {
  analysis: {
    findUnique(args: {
      where: { id: string };
      include: { dependencies: true };
    }): Promise<{ id: string; dependencies: DependencyInput[] } | null>;
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
      create: Omit<AnalysisResultData, "dependencyScores"> & { analysisId: string };
      update: Omit<AnalysisResultData, "dependencyScores">;
    }): Promise<{ id: string }>;
  };
  dependencyScore: {
    deleteMany(args: { where: { analysisResultId: string } }): Promise<unknown>;
    createMany(args: { data: Array<DependencyScoreData & { analysisResultId: string }> }): Promise<unknown>;
  };
};

type ProcessorOptions = {
  prisma: AnalysisRepository;
  runAnalysis?: (
    data: AnalysisJobData & { dependencies: DependencyInput[] }
  ) => Promise<AnalysisResultData>;
  runGitHubMiner?: (
    data: GitHubMinerInput
  ) => Promise<GitHubMinerOutput>;
  logger?: Pick<Console, "log" | "error">;
};

export async function processAnalysisJob(
  job: Pick<Job<AnalysisJobData>, "id" | "data" | "attemptsMade">,
  options: ProcessorOptions
) {
  const { prisma, runAnalysis = defaultRunAnalysis, runGitHubMiner = defaultRunGitHubMiner, logger = console } = options;
  const { analysisId } = job.data;

  logger.log(
    `[worker] Job received: jobId=${job.id ?? analysisId}, analysisId=${analysisId}, attemptsMade=${job.attemptsMade}`
  );

  logger.log(`[worker] Loading analysis: analysisId=${analysisId}`);

  const analysis = await prisma.analysis.findUnique({
    where: { id: analysisId },
    include: {
      dependencies: true,
    },
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

    for (const dependency of analysis.dependencies) {
      logger.log(
        `[worker] Fetching GitHub data for dependency: analysisId=${analysisId}, dependencyId=${dependency.name}, versionRequirement=${dependency.versionRequirement}`
      );
      const gitHubData = await runGitHubMiner({
        fullPackageName: dependency.name,
        versionRequirement: dependency.versionRequirement,
        dependencyId: dependency.id,
      });
      //TODO do something with gitHubData
    }

    const result = await runAnalysis({
      analysisId,
      dependencies: analysis.dependencies,
    });

    logger.log(
      `[worker] Saving analysis result: analysisId=${analysisId}, globalScore=${result.globalScore}, riskLevel=${result.riskLevel}`
    );

    const { dependencyScores = [], ...analysisResult } = result;

    const savedResult = await prisma.analysisResult.upsert({
      where: { analysisId },
      create: {
        analysisId,
        ...analysisResult,
      },
      update: analysisResult,
    });

    await prisma.dependencyScore.deleteMany({
      where: {
        analysisResultId: savedResult.id,
      },
    });

    if (dependencyScores.length > 0) {
      await prisma.dependencyScore.createMany({
        data: dependencyScores.map((dependencyScore) => ({
          analysisResultId: savedResult.id,
          ...dependencyScore,
        })),
      });
    }

    logger.log(
      `[worker] Analysis result saved: analysisId=${analysisId}, dependencyScores=${dependencyScores.length}`
    );

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

async function defaultRunAnalysis(
  data: AnalysisJobData & { dependencies: DependencyInput[] }
): Promise<AnalysisResultData> {
  return scoreDependencies(data.dependencies);
}

async function defaultRunGitHubMiner(data: GitHubMinerInput): Promise<GitHubMinerOutput> {
  return fetchGitHubMinerData(data);
}
