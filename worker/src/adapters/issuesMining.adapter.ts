import { analyzeIssues } from '../issuesMining/run_all.js';
import type { IssuesMiningResult, IssuesMiningMetrics } from '../types/issuesMining.types.js';

const nullMetrics: IssuesMiningMetrics = {
  totalIssuesAnalyzed: null,
  openIssues: null,
  closedIssues: null,
  closedIssuesAnalyzed: null,
  recentActivityCount: null,
  averageResolutionTimeHours: null,
  averageResolutionTimeDays: null,
  averageFirstResponseTimeDays: null,
  firstResponseTimeHours: null,
  closureRate: null,
  noResponseRate: null,
  closeRateByPR: null,
  closedByPrRate: null,
  closedByPRRate: null,
  codeResolutionRate: null,
  postCloseActivityRate: null,
  openToAssignedTimeHours: null,
  mergedPRRate: null,
  uncodedCloseRate: null,
};

function hoursToDays(hours: number | null | undefined) {
  return hours == null ? null : hours / 24;
}

function ratio(numerator: number | null | undefined, denominator: number | null | undefined) {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return numerator / denominator;
}

export async function runIssuesMining(
  owner: string,
  repo: string,
  sinceDate: string
): Promise<IssuesMiningResult> {
  try {
    const result = await analyzeIssues(owner, repo, sinceDate);

    const metrics: IssuesMiningMetrics = {
      totalIssuesAnalyzed: result.classifications?.totalIssuesAnalyzed ?? null,
      openIssues: result.classifications?.openIssues ?? null,
      closedIssues: result.classifications?.closedIssues ?? null,
      closedIssuesAnalyzed: result.classifications?.closedIssues ?? null,
      recentActivityCount: result.classifications?.recentActivityCount ?? null,
      averageResolutionTimeHours: result.classifications?.averageResolutionTimeHours ?? null,
      averageResolutionTimeDays: hoursToDays(result.classifications?.averageResolutionTimeHours),
      averageFirstResponseTimeDays: hoursToDays(
        result.classifications?.firstResponseTimeHours ?? result.classifications?.openToAssignedTimeHours
      ),
      firstResponseTimeHours:
        result.classifications?.firstResponseTimeHours ??
        result.classifications?.openToAssignedTimeHours ??
        null,
      closureRate:
        result.classifications?.closureRate ??
        ratio(result.classifications?.closedIssues, result.classifications?.totalIssuesAnalyzed),
      noResponseRate: result.classifications?.noResponseRate ?? null,
      closeRateByPR: result.classifications?.closeRateByPR ?? null,
      closedByPrRate:
        result.classifications?.closedByPrRate ??
        result.classifications?.closedByPRRate ??
        result.classifications?.closeRateByPR ??
        null,
      closedByPRRate:
        result.classifications?.closedByPRRate ??
        result.classifications?.closedByPrRate ??
        result.classifications?.closeRateByPR ??
        null,
      codeResolutionRate: result.classifications?.codeResolutionRate ?? null,
      postCloseActivityRate: result.classifications?.postCloseActivityRate ?? null,
      openToAssignedTimeHours: result.classifications?.openToAssignedTimeHours ?? null,
      mergedPRRate: result.classifications?.mergedPRRate ?? null,
      uncodedCloseRate: result.classifications?.uncodedCloseRate ?? null,
    };

    return {
      status: 'SUCCESS',
      metrics,
      rawData: result.raw,
    };

  } catch (err) {
    return {
      status: 'FAILED',
      metrics: nullMetrics,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
