import { projectQuery, issueItemQuery } from './queries.js';
import { graphql } from '@octokit/graphql';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const ROTATION_THRESHOLD = 300;

const tokens = process.env.GITHUB_API_TOKEN.split(',').map(t => t.trim()).filter(Boolean);
const tokenReset = tokens.map(() => "0");
const tokenRemaining = tokens.map(() => -1);
let tokenNum = 0;

let endingProjectIndex = 300;
let currentProjectIndex = 0;
let currentCursor = "";
let nbItemsPerQuery = 100;
let tracking = {};

let graphqlWithAuth = graphql.defaults({
  headers: {
    authorization: `token ${tokens[0]}`
  }
});

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

async function executeQuery0(projects, index, cursor, startDate) {
  try {
    if (index >= endingProjectIndex) return;

    const [projectOwner, projectName] =
      projects[index].replace("\r", "").split("/");

    const repoFullName = `${projectOwner}/${projectName}`;

    if (!(repoFullName in tracking)) tracking[repoFullName] = 0;
    if (tracking[repoFullName]++ > 20000) return;

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
    nbItemsPerQuery = 1;

    setTimeout(
      () => executeQuery0(projects, index, cursor, startDate),
      5000
    );
  }
}

async function getItems(owner, name, cursor, nextCursor, items) {
  try {
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
        items
      );
    }

    return items;

  } catch (e) {
    return items;
  }
}

export async function getIssues(owner, repo, startDate) {
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

  return Object.values(issues);
}