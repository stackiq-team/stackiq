function extractCloser(items) {
  for (const { node } of items) {
    if (node.__typename === 'ClosedEvent') {
      if (!node.closer) return { type: null, merged: null };
      return {
        type: node.closer.__typename,  // 'PullRequest' | 'Commit'
        merged: node.closer.merged ?? null,
      };
    }
  }
  return { type: null, merged: null };
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
    const eventTime = new Date(node.createdAt).getTime();
    return eventTime > closedTime;
  });
}

function summarizeIssue(node) {
  const items = node.items?.edges ?? [];

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