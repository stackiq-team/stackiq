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
  medianResolutionTimeDays: null,
  averageFirstResponseTimeDays: null,
  medianFirstResponseTimeDays: null,
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
  healthyClosureRate: null,
  staleOpenIssueRate: null,
  sampleRecentOpenIssues: null,
  sampleRecentClosedIssues: null,
  sampleOlderClosedIssues: null,
  sampleOldOpenIssues: null,
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
      medianResolutionTimeDays:
        result.classifications?.medianResolutionTimeDays ??
        hoursToDays(result.classifications?.medianResolutionTimeHours),
      averageFirstResponseTimeDays: hoursToDays(
        result.classifications?.firstResponseTimeHours ?? result.classifications?.openToAssignedTimeHours
      ),
      medianFirstResponseTimeDays:
        result.classifications?.medianFirstResponseTimeDays ??
        hoursToDays(result.classifications?.medianFirstResponseTimeHours),
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
      healthyClosureRate: result.classifications?.healthyClosureRate ?? null,
      staleOpenIssueRate: result.classifications?.staleOpenIssueRate ?? null,
      sampleRecentOpenIssues: result.classifications?.sampleRecentOpenIssues ?? null,
      sampleRecentClosedIssues: result.classifications?.sampleRecentClosedIssues ?? null,
      sampleOlderClosedIssues: result.classifications?.sampleOlderClosedIssues ?? null,
      sampleOldOpenIssues: result.classifications?.sampleOldOpenIssues ?? null,
    };

    return {
      status: 'SUCCESS',
      metrics,
      rawData: result.raw,
      issueData: result.issueData,
    };

  } catch (err) {
    return {
      status: 'FAILED',
      metrics: nullMetrics,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
