import { analyzeIssues } from '../issuesMining/run_all.js';
import type { IssuesMiningResult, IssuesMiningMetrics } from '../types/issuesMining.types.js';

const nullMetrics: IssuesMiningMetrics = {
  totalIssuesAnalyzed: null,
  openIssues: null,
  closedIssues: null,
  recentActivityCount: null,
  averageResolutionTimeHours: null,
  closeRateByPR: null,
  codeResolutionRate: null,
  openToAssignedTimeHours: null,
  mergedPRRate: null,
  uncodedCloseRate: null,
};

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
      recentActivityCount: result.classifications?.recentActivityCount ?? null,
      averageResolutionTimeHours: result.classifications?.averageResolutionTimeHours ?? null,
      closeRateByPR: result.classifications?.closeRateByPR ?? null,
      codeResolutionRate: result.classifications?.codeResolutionRate ?? null,
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