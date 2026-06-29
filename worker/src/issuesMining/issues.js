import { projectQuery, issueItemQuery } from './queries.js';
import { graphql } from '@octokit/graphql';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const ROTATION_THRESHOLD = 300;
const DEFAULT_MAX_ISSUES = 10;
const DEFAULT_MAX_TIMELINE_PAGES = 1;

let tokens = [];
let tokenReset = [];
let tokenRemaining = [];
let tokenNum = 0;

let endingProjectIndex = 300;
let currentProjectIndex = 0;
let currentCursor = "";
let nbItemsPerQuery = 100;
let tracking = {};

let graphqlWithAuth = graphql.defaults({ headers: {} });

function loadTokens() {
  tokens = (process.env.GITHUB_API_TOKEN ?? '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    throw new Error('GITHUB_API_TOKEN is required to run issuesMining');
  }

  tokenReset = tokens.map(() => "0");
  tokenRemaining = tokens.map(() => -1);
  tokenNum = 0;
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

async function checkAllTokens() {
  for (let i = 0; i < tokens.length; i++) {
    const { rateLimit } = await graphql(
      `query { rateLimit { limit remaining resetAt } }`,
      { headers: { authorization: `token ${tokens[i]}` } }
    );
    tokenRemaining[i] = rateLimit.remaining;
    tokenReset[i] = rateLimit.resetAt;
    const resetIn = Math.ceil((new Date(rateLimit.resetAt) - new Date()) / 1000 / 60);
    // console.log(`[tokens] Token ${i}: ${rateLimit.remaining}/${rateLimit.limit} remaining — resets in ${resetIn} min`);
  }

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

function getMaxIssues() {
  const configured = Number(process.env.ISSUES_MINING_MAX_ISSUES ?? DEFAULT_MAX_ISSUES);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_ISSUES;
}

function getMaxTimelinePages() {
  const configured = Number(process.env.ISSUES_MINING_MAX_TIMELINE_PAGES ?? DEFAULT_MAX_TIMELINE_PAGES);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_TIMELINE_PAGES;
}

async function executeQuery0(projects, index, cursor, startDate) {
  try {
    if (index >= endingProjectIndex) return;

    const [projectOwner, projectName] =
      projects[index].replace("\r", "").split("/");

    const repoFullName = `${projectOwner}/${projectName}`;

    if (!(repoFullName in tracking)) tracking[repoFullName] = 0;
    if (tracking[repoFullName] >= getMaxIssues()) {
      console.log(`[issuesMining] Reached issue sample cap: repo=${repoFullName}, maxIssues=${getMaxIssues()}`);
      return;
    }
    tracking[repoFullName]++;

    // rotate if current token is running low
    if (tokenRemaining[tokenNum] !== -1 && tokenRemaining[tokenNum] <= ROTATION_THRESHOLD) {
      console.log(`[tokens] Token ${tokenNum} low (${tokenRemaining[tokenNum]} remaining), rotating...`);
      const switched = switchToken();
      if (!switched) {
        throw new Error('All GitHub API tokens exhausted. Wait for reset before continuing.');
      }
    }

    const { repository, rateLimit } = await graphqlWithAuth(
      projectQuery(projectOwner, projectName, cursor, startDate)
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

      if (
        node?.items?.totalCount > nbItemsPerQuery &&
        node.items.pageInfo?.hasNextPage
      ) {
        const extraItems = await getItems(
          projectOwner,
          projectName,
          cursor,
          node.items.pageInfo.endCursor,
          node.items.edges
        );

        idata.issues.edges[0].node.items.edges = extraItems;
      }

      issues[edges[0].node.number] = idata;
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

    return executeQuery0(projects, nextIndex, cursor, startDate);

  } catch (err) {
    console.error('Error:', err.message);
    throw err;
  }
}

async function getItems(owner, name, cursor, nextCursor, items, pageCount = 1) {
  try {
    if (pageCount >= getMaxTimelinePages()) {
      return items;
    }

    const { repository } = await graphqlWithAuth(
      issueItemQuery(owner, name, cursor, nextCursor)
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
        pageCount + 1
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

  await executeQuery0(
    projects,
    currentProjectIndex,
    currentCursor,
    startDate
  );

  const values = Object.values(issues);
  console.log(`[issuesMining] Issue sample collected: repo=${owner}/${repo}, issues=${values.length}, maxIssues=${getMaxIssues()}`);
  return values;
}
