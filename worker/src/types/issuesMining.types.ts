export interface IssuesMiningMetrics {
  totalIssuesAnalyzed: number | null;
  openIssues: number | null;
  closedIssues: number | null;
  closedIssuesAnalyzed: number | null;
  recentActivityCount: number | null;     // issues opened or closed in the last 30 days
  averageResolutionTimeHours: number | null;
  averageResolutionTimeDays: number | null;
  averageFirstResponseTimeDays: number | null;
  firstResponseTimeHours: number | null;
  closureRate: number | null;
  noResponseRate: number | null;
  closeRateByPR: number | null;           // 0-1 ratio
  closedByPrRate: number | null;
  closedByPRRate: number | null;
  codeResolutionRate: number | null;      // closeByPR + closeByCommit combined
  postCloseActivityRate: number | null;
  openToAssignedTimeHours: number | null;
  mergedPRRate: number | null;            // of PR-closed issues, how many were actually merged
  uncodedCloseRate: number | null;        // ratio of issues closed with no code reference
}

export interface IssueSummary {
  number: number;
  publishedAt: string;
  closedAt: string | null;
  closed: boolean;
  assigneesCount: number;
  firstAssignedAt: string | null;
  closer: {
    stateReason: string | null;
    type: string | null;
    merged: boolean | null;
    closedByBot: boolean | null;
    closedByLogin: string | null;
    wasReclassified: boolean;
  };
  hasConnectedEvent: boolean;
  hasPostCloseActivity: boolean;
  tooManyTimelineItems: boolean;
  timelineTotalCount: number;
  timelineCapturedCount: number;
}

export interface IssuesMiningResult {
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  metrics: IssuesMiningMetrics;
  rawData?: unknown;
  issueData?: IssueSummary[];
  error?: string;
}
