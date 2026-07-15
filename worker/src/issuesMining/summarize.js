function extractCloser(items) {
  const closedEvents = items
    .map(({ node }) => node)
    .filter((node) => node.__typename === 'ClosedEvent');

  if (closedEvents.length === 0) {
    return {
      stateReason: null,
      type: null,
      merged: null,
      closedByBot: null,
      closedByLogin: null,
      wasReclassified: false,
    };
  }

  const last = closedEvents[closedEvents.length - 1];

  return {
    stateReason: last.stateReason ?? null,       // 'COMPLETED' | 'NOT_PLANNED' | 'REOPENED'
    type: last.closer?.__typename ?? null,        // 'PullRequest' | 'Commit' | null
    merged: last.closer?.merged ?? null,
    closedByBot: last.actor?.__typename === 'Bot',
    closedByLogin: last.actor?.login ?? null,
    wasReclassified: closedEvents.length > 1,
  };
}

function extractFirstAssignedAt(items) {
  for (const { node } of items) {
    if (node.__typename === 'AssignedEvent') {
      return node.createdAt;
    }
  }
  return null;
}

function extractHasConnectedEvent(items) {
  return items.some(({ node }) => node.__typename === 'ConnectedEvent');
}

function extractHasPostCloseActivity(items, closedAt) {
  if (!closedAt) return false;
  const closedTime = new Date(closedAt).getTime();
  return items.some(({ node }) => {
    if (!node.createdAt) return false; // some node types (opaque unions) lack createdAt
    const eventTime = new Date(node.createdAt).getTime();
    return eventTime > closedTime;
  });
}

function extractTooManyTimelineItems(node, items) {
  const totalCount = node.items?.totalCount ?? 0;
  const hasNextPage = node.items?.pageInfo?.hasNextPage ?? false;
  const capturedCount = items.length;

  const truncated = capturedCount < totalCount || hasNextPage;

  return {
    tooManyTimelineItems: truncated,
    timelineTotalCount: totalCount,
    timelineCapturedCount: capturedCount,
  };
}

function summarizeIssue(node) {
  const items = node.items?.edges ?? [];
  const timelineStatus = extractTooManyTimelineItems(node, items);

  return {
    number: node.number,
    publishedAt: node.publishedAt,
    closedAt: node.closedAt,
    closed: node.closed,
    assigneesCount: node.assignees?.totalCount ?? 0,
    firstAssignedAt: extractFirstAssignedAt(items),
    closer: extractCloser(items),
    hasConnectedEvent: extractHasConnectedEvent(items),
    hasPostCloseActivity: extractHasPostCloseActivity(items, node.closedAt),
    ...timelineStatus,
  };
}

export default function summarize(rawData) {
  const summarized = [];

  for (const page of rawData) {
    const issueNode = page.issues?.edges?.[0]?.node;
    if (!issueNode) continue;
    summarized.push(summarizeIssue(issueNode));
  }

  return summarized;
}