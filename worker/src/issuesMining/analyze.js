const RECENT_DAYS = 30;
const STALE_OPEN_DAYS = 180;

function isRecent(dateStr) {
  if (!dateStr) return false;
  const date = new Date(dateStr).getTime();
  const cutoff = Date.now() - RECENT_DAYS * 86400000;
  return date >= cutoff;
}

function average(values) {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function ratio(count, total) {
  if (total === 0) return null;
  return count / total;
}

function isStaleOpen(issue) {
  if (issue.closed || !issue.publishedAt) return false;
  const ageMs = Date.now() - new Date(issue.publishedAt).getTime();
  return ageMs >= STALE_OPEN_DAYS * 86400000;
}

function isHealthyClosure(issue) {
  if (!issue.closed) return false;
  if (issue.closer.type === 'PullRequest' || issue.closer.type === 'Commit') return true;
  return ['COMPLETED', 'DUPLICATE', 'NOT_PLANNED'].includes(issue.closer.stateReason);
}

export default function analyze(summarized) {
  const total = summarized.length;
  if (total === 0) return nullMetrics();

  const open = summarized.filter(i => !i.closed);
  const closed = summarized.filter(i => i.closed);

  const closedByPR = closed.filter(i => i.closer.type === 'PullRequest');
  const closedByCommit = closed.filter(i => i.closer.type === 'Commit');
  const closedUncoded = closed.filter(i => i.closer.type === null);
  const mergedPR = closedByPR.filter(i => i.closer.merged === true);
  const healthyClosed = closed.filter(isHealthyClosure);
  const staleOpen = open.filter(isStaleOpen);

  const recentActivity = summarized.filter(
    i => isRecent(i.publishedAt) || isRecent(i.closedAt)
  );

  const resolutionTimes = closed
    .filter(i => i.publishedAt && i.closedAt)
    .map(i => (new Date(i.closedAt) - new Date(i.publishedAt)) / (1000 * 60 * 60));

  const responseTimes = summarized
    .map(i => {
      const firstResponse = i.firstMaintainerResponseAt ?? i.firstAssignedAt;
      if (!firstResponse || !i.publishedAt) return null;
      return (new Date(firstResponse) - new Date(i.publishedAt)) / (1000 * 60 * 60);
    })
    .filter(value => value != null && value >= 0);

  const sampleBuckets = summarized.reduce((counts, issue) => {
    if (issue.sampleBucket && counts[issue.sampleBucket] != null) {
      counts[issue.sampleBucket]++;
    }
    return counts;
  }, {
    recentOpen: 0,
    recentClosed: 0,
    olderClosed: 0,
    oldOpen: 0,
  });

  return {
    totalIssuesAnalyzed: total,
    openIssues: open.length,
    closedIssues: closed.length,
    closedIssuesAnalyzed: closed.length,
    recentActivityCount: recentActivity.length,
    averageResolutionTimeHours: average(resolutionTimes),
    medianResolutionTimeHours: median(resolutionTimes),
    closeRateByPR: ratio(closedByPR.length, closed.length),
    codeResolutionRate: ratio(closedByPR.length + closedByCommit.length, closed.length),
    firstResponseTimeHours: average(responseTimes),
    medianFirstResponseTimeHours: median(responseTimes),
    openToAssignedTimeHours: average(responseTimes),
    mergedPRRate: ratio(mergedPR.length, closedByPR.length),
    uncodedCloseRate: ratio(closedUncoded.length, closed.length),
    healthyClosureRate: ratio(healthyClosed.length, closed.length),
    staleOpenIssueRate: ratio(staleOpen.length, open.length),
    sampleRecentOpenIssues: sampleBuckets.recentOpen,
    sampleRecentClosedIssues: sampleBuckets.recentClosed,
    sampleOlderClosedIssues: sampleBuckets.olderClosed,
    sampleOldOpenIssues: sampleBuckets.oldOpen,
  };
}

function nullMetrics() {
  return {
    totalIssuesAnalyzed: null,
    openIssues: null,
    closedIssues: null,
    recentActivityCount: null,
    averageResolutionTimeHours: null,
    medianResolutionTimeHours: null,
    firstResponseTimeHours: null,
    medianFirstResponseTimeHours: null,
    closeRateByPR: null,
    codeResolutionRate: null,
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
}
