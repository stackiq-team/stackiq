const RECENT_DAYS = 30;

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

function ratio(count, total) {
  if (total === 0) return null;
  return count / total;
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

  const recentActivity = summarized.filter(
    i => isRecent(i.publishedAt) || isRecent(i.closedAt)
  );

  const resolutionTimes = closed
    .filter(i => i.publishedAt && i.closedAt)
    .map(i => (new Date(i.closedAt) - new Date(i.publishedAt)) / (1000 * 60 * 60));

  const assignmentTimes = summarized
    .filter(i => i.firstAssignedAt && i.publishedAt)
    .map(i => (new Date(i.firstAssignedAt) - new Date(i.publishedAt)) / (1000 * 60 * 60));

  return {
    totalIssuesAnalyzed: total,
    openIssues: open.length,
    closedIssues: closed.length,
    recentActivityCount: recentActivity.length,
    averageResolutionTimeHours: average(resolutionTimes),
    closeRateByPR: ratio(closedByPR.length, closed.length),
    codeResolutionRate: ratio(closedByPR.length + closedByCommit.length, closed.length),
    openToAssignedTimeHours: average(assignmentTimes),
    mergedPRRate: ratio(mergedPR.length, closedByPR.length),
    uncodedCloseRate: ratio(closedUncoded.length, closed.length),
  };
}

function nullMetrics() {
  return {
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
}