export interface IssuesMiningMetrics {
  totalIssuesAnalyzed: number | null;
  averageResolutionTimeHours: number | null;
  closeRateByPR: number | null;           // 0-1 ratio
  codeResolutionRate: number | null;      // closeByPR + closeByCommit combined
  openToAssignedTimeHours: number | null;
  mergedPRRate: number | null;            // of PR-closed issues, how many were actually merged
  uncodedCloseRate: number | null;        // ratio of issues closed with no code reference
}

export interface IssuesMiningResult {
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  metrics: IssuesMiningMetrics;
  rawData?: unknown;
  error?: string;
}