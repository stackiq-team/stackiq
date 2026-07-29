import dotenv from 'dotenv';
dotenv.config();
import { projectQuery, issueItemQuery } from './queries.js';
import { graphql } from '@octokit/graphql';
import path from 'path';
import { fileURLToPath } from 'url';

const ROTATION_THRESHOLD = 300;
const DEFAULT_MAX_OPEN_ISSUES = 30;
const DEFAULT_MAX_CLOSED_ISSUES = 70;
const DEFAULT_RECENT_OPEN_ISSUES = 30;
const DEFAULT_RECENT_CLOSED_ISSUES = 40;
const DEFAULT_OLDER_CLOSED_ISSUES = 30;
const DEFAULT_OLD_OPEN_ISSUES = 20;
const DEFAULT_MAX_TIMELINE_PAGES = 1;
const DEFAULT_HISTORY_START_DATE = '2015-01-01';
const DEFAULT_TOKEN_STATUS_TTL_MS = 60_000;

let tokens = [];
let tokenReset = [];
let tokenRemaining = [];
let tokenNum = 0;
let tokenSignature = "";
let lastTokenStatusCheckAt = 0;

let endingProjectIndex = 300;
let currentProjectIndex = 0;
let currentCursor = "";
let nbItemsPerQuery = 100;
let tracking = {};

let graphqlWithAuth = graphql.defaults({ headers: {} });

function loadTokens() {
  const loadedTokens = (process.env.GITHUB_API_TOKEN ?? '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  if (loadedTokens.length === 0) {
    throw new Error('GITHUB_API_TOKEN is required to run issuesMining');
  }

  const loadedSignature = loadedTokens.join("|");
  if (loadedSignature !== tokenSignature) {
    tokens = loadedTokens;
    tokenReset = tokens.map(() => "0");
    tokenRemaining = tokens.map(() => -1);
    tokenNum = 0;
    tokenSignature = loadedSignature;
    lastTokenStatusCheckAt = 0;
  }

  graphqlWithAuth = graphql.defaults({
    headers: {
      authorization: `token ${tokens[0]}`
    }
  });
}

function switchToken() {
  const startToken = tokenNum;
  do {
    tokenNum = (tokenNum + 1) % tokens.length;
    if (tokenRemaining[tokenNum] === -1 || tokenRemaining[tokenNum] > ROTATION_THRESHOLD) {
      // console.log(`[tokens] Switched to token ${tokenNum}`);
      graphqlWithAuth = graphql.defaults({
        headers: { authorization: `token ${tokens[tokenNum]}` }
      });
      return true;
    }
  } while (tokenNum !== startToken);

  return false;
}

function trackingKey(repoFullName, state) {
  return `${repoFullName}:${state}`;
}

function bucketTrackingKey(repoFullName, bucket) {
  return `${repoFullName}:${bucket}`;
}

async function checkAllTokens() {
  const now = Date.now();
  const statusTtlMs = positiveInteger(
    process.env.ISSUES_MINING_TOKEN_STATUS_TTL_MS,
    DEFAULT_TOKEN_STATUS_TTL_MS
  );
  const bestKnownRemaining = Math.max(...tokenRemaining);

  if (
    lastTokenStatusCheckAt > 0 &&
    now - lastTokenStatusCheckAt < statusTtlMs &&
    bestKnownRemaining > ROTATION_THRESHOLD
  ) {
    const best = tokenRemaining.indexOf(bestKnownRemaining);
    tokenNum = best;
    graphqlWithAuth = graphql.defaults({
      headers: { authorization: `token ${tokens[best]}` }
    });
    console.log(`[tokens] Reusing cached token status: token=${best}, remaining=${bestKnownRemaining}, ttlMs=${statusTtlMs}`);
    return;
  }

  for (let i = 0; i < tokens.length; i++) {
    const { rateLimit } = await graphql(
      `query { rateLimit { limit remaining resetAt } }`,
      { headers: { authorization: `token ${tokens[i]}` } }
    );
    tokenRemaining[i] = rateLimit.remaining;
    tokenReset[i] = rateLimit.resetAt;
    const resetIn = Math.ceil((new Date(rateLimit.resetAt) - new Date()) / 1000 / 60);
    console.log(`[tokens] Token ${i}: ${rateLimit.remaining}/${rateLimit.limit} remaining — resets in ${resetIn} min`);
  }

  lastTokenStatusCheckAt = Date.now();

  // pick the token with the most remaining
  const best = tokenRemaining.indexOf(Math.max(...tokenRemaining));
  tokenNum = best;
  graphqlWithAuth = graphql.defaults({
    headers: { authorization: `token ${tokens[best]}` }
  });
  // console.log(`[tokens] Starting with token ${best} (${tokenRemaining[best]} remaining)`);

  if (tokenRemaining[best] < ROTATION_THRESHOLD) {
    throw new Error(`All tokens are below ${ROTATION_THRESHOLD} remaining. Wait for reset before running.`);
  }
}

let issues = {};

function positiveInteger(value, fallback) {
  const configured = Number(value);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : fallback;
}

function getLegacyMaxIssues(state) {
  const fallback = state === 'OPEN' ? DEFAULT_MAX_OPEN_ISSUES : DEFAULT_MAX_CLOSED_ISSUES;
  const totalConfigured = Number(process.env.ISSUES_MINING_MAX_ISSUES);
  const totalFallback = DEFAULT_MAX_OPEN_ISSUES + DEFAULT_MAX_CLOSED_ISSUES;
  const derivedFallback = Number.isFinite(totalConfigured) && totalConfigured > 0
    ? Math.max(1, Math.round(totalConfigured * (fallback / totalFallback)))
    : fallback;
  return state === 'OPEN'
    ? positiveInteger(process.env.ISSUES_MINING_MAX_OPEN_ISSUES, derivedFallback)
    : positiveInteger(process.env.ISSUES_MINING_MAX_CLOSED_ISSUES, derivedFallback);
}

function getSampleBuckets() {
  const configuredBuckets = [
    {
      name: 'recentOpen',
      state: 'OPEN',
      since: null,
      limit: positiveInteger(
        process.env.ISSUES_MINING_RECENT_OPEN_LIMIT,
        getLegacyMaxIssues('OPEN') || DEFAULT_RECENT_OPEN_ISSUES
      ),
    },
    {
      name: 'recentClosed',
      state: 'CLOSED',
      since: null,
      limit: positiveInteger(
        process.env.ISSUES_MINING_RECENT_CLOSED_LIMIT,
        Math.min(getLegacyMaxIssues('CLOSED') || DEFAULT_RECENT_CLOSED_ISSUES, DEFAULT_RECENT_CLOSED_ISSUES)
      ),
    },
    {
      name: 'olderClosed',
      state: 'CLOSED',
      since: process.env.ISSUES_MINING_HISTORY_START_DATE ?? DEFAULT_HISTORY_START_DATE,
      limit: positiveInteger(process.env.ISSUES_MINING_OLDER_CLOSED_LIMIT, DEFAULT_OLDER_CLOSED_ISSUES),
    },
    {
      name: 'oldOpen',
      state: 'OPEN',
      since: process.env.ISSUES_MINING_HISTORY_START_DATE ?? DEFAULT_HISTORY_START_DATE,
      limit: positiveInteger(process.env.ISSUES_MINING_OLD_OPEN_LIMIT, DEFAULT_OLD_OPEN_ISSUES),
    },
  ].filter((bucket) => bucket.limit > 0);

  return capSampleBuckets(configuredBuckets);
}

function getTotalIssueLimit() {
  return positiveInteger(
    process.env.ISSUES_MINING_MAX_ISSUES,
    configuredDefaultIssueLimit()
  );
}

function configuredDefaultIssueLimit() {
  return (
    DEFAULT_RECENT_OPEN_ISSUES +
    DEFAULT_RECENT_CLOSED_ISSUES +
    DEFAULT_OLDER_CLOSED_ISSUES +
    DEFAULT_OLD_OPEN_ISSUES
  );
}

function capSampleBuckets(buckets) {
  const maxIssues = getTotalIssueLimit();
  const configuredTotal = buckets.reduce((sum, bucket) => sum + bucket.limit, 0);
  if (configuredTotal <= maxIssues) return buckets;

  let remaining = maxIssues;
  return buckets
    .map((bucket, index) => {
      const bucketsLeft = buckets.length - index;
      const proportionalLimit = Math.floor((bucket.limit / configuredTotal) * maxIssues);
      const limit = index === buckets.length - 1
        ? remaining
        : Math.min(bucket.limit, Math.max(1, Math.min(remaining - (bucketsLeft - 1), proportionalLimit)));

      remaining -= limit;
      return {
        ...bucket,
        limit,
      };
    })
    .filter((bucket) => bucket.limit > 0);
}

function getMaxTimelinePages() {
  const configured = Number(process.env.ISSUES_MINING_MAX_TIMELINE_PAGES ?? DEFAULT_MAX_TIMELINE_PAGES);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_TIMELINE_PAGES;
}

async function executeQuery0(projects, index, cursor, startDate, state, bucketName, maxIssues) {
  try {
    if (index >= endingProjectIndex) return;

    const [projectOwner, projectName] =
      projects[index].replace("\r", "").split("/");

    const repoFullName = `${projectOwner}/${projectName}`;
    const key = bucketTrackingKey(repoFullName, bucketName);

    if (!(key in tracking)) tracking[key] = 0;
    if (tracking[key] >= maxIssues) {
      console.log(`[issuesMining] Reached ${bucketName} issue cap: repo=${repoFullName}, max=${maxIssues}`);
      return;
    }

    // rotate if current token is running low
    if (tokenRemaining[tokenNum] !== -1 && tokenRemaining[tokenNum] <= ROTATION_THRESHOLD) {
      console.log(`[tokens] Token ${tokenNum} low (${tokenRemaining[tokenNum]} remaining), rotating...`);
      const switched = switchToken();
      if (!switched) {
        throw new Error('All GitHub API tokens exhausted. Wait for reset before continuing.');
      }
    }

    const { repository, rateLimit } = await graphqlWithAuth(
      projectQuery(projectOwner, projectName, cursor, startDate, state)
    );

    tokenReset[tokenNum] = rateLimit.resetAt;
    tokenRemaining[tokenNum] = rateLimit.remaining;
    // console.log(`[tokens] Token ${tokenNum}: ${rateLimit.remaining} remaining`);

    const edges = repository.issues.edges;
    const pageInfo = repository.issues.pageInfo;

    if (edges && edges.length > 0) {
      const node = edges[0].node;
      const idata = {
        nameWithOwner: repoFullName,
        issues: {
          totalCount: repository.issues.totalCount,
          pageInfo,
          edges: [edges[0]]
        }
      };

      if (node.items.pageInfo?.hasNextPage) {
        const extraItems = await getItems(
          projectOwner,
          projectName,
          cursor,
          node.items.pageInfo.endCursor,
          node.items.edges,
          1,
          startDate,
          state
        );

        idata.issues.edges[0].node.items.edges = extraItems;
      }

      const issueNumber = edges[0].node.number;
      const alreadyCollected = Boolean(issues[issueNumber]);
      if (!alreadyCollected) {
        idata.issues.edges[0].node.sampleBucket = bucketName;
        issues[issueNumber] = idata;
        tracking[key]++;
      }
    }

    let nextIndex = index;

    if (pageInfo.hasNextPage) {
      cursor = pageInfo.endCursor;
    } else if (index < projects.length - 1) {
      cursor = "";
      nextIndex = index + 1;
    } else {
      return;
    }

    return executeQuery0(projects, nextIndex, cursor, startDate, state, bucketName, maxIssues);

  } catch (err) {
    console.error('Error:', err.message);
    throw err;
  }
}

async function getItems(owner, name, cursor, nextCursor, items, pageCount = 1, since, state) {
  try {
    if (pageCount >= getMaxTimelinePages()) {
      return items;
    }

    const { repository } = await graphqlWithAuth(
      issueItemQuery(owner, name, cursor, nextCursor, since, state)
    );

    const newEdges = repository.issues.edges[0].node.items.edges;
    const itemKeys = new Set(items.map(item => item.node.id));

    for (const newItem of newEdges) {
      if (!itemKeys.has(newItem.node.id)) {
        items.push(newItem);
      }
    }

    const itemPageInfo =
      repository.issues.edges[0].node.items.pageInfo;

    if (itemPageInfo?.hasNextPage) {
      return getItems(
        owner,
        name,
        cursor,
        itemPageInfo.endCursor,
        items,
        pageCount + 1,
        since,
        state
      );
    }

    return items;

  } catch (e) {
    return items;
  }
}

export async function getIssues(owner, repo, startDate) {
  loadTokens();
  issues = {};
  tracking = {};

  await checkAllTokens();

  const projects = [`${owner}/${repo}`];

  const sampleBuckets = getSampleBuckets().map((bucket) => ({
    ...bucket,
    since: bucket.since ?? startDate,
  }));

  for (const bucket of sampleBuckets) {
    await executeQuery0(
      projects,
      currentProjectIndex,
      currentCursor,
      bucket.since,
      bucket.state,
      bucket.name,
      bucket.limit
    );
  }

  const values = Object.values(issues);
  const repoFullName = `${owner}/${repo}`;
  const bucketCounts = Object.fromEntries(
    sampleBuckets.map((bucket) => [
      bucket.name,
      tracking[bucketTrackingKey(repoFullName, bucket.name)] ?? 0,
    ])
  );
  console.log(
    `[issuesMining] Issue sample collected: repo=${owner}/${repo}, ` +
    `total=${values.length}, recentOpen=${bucketCounts.recentOpen ?? 0}, ` +
    `recentClosed=${bucketCounts.recentClosed ?? 0}, olderClosed=${bucketCounts.olderClosed ?? 0}, ` +
    `oldOpen=${bucketCounts.oldOpen ?? 0}`
  );
  return values;
}
