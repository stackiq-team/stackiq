const { projectQuery, issueItemQuery } = require('./queries');
const { graphql } = require("@octokit/graphql");
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const tokens = [`${process.env.GITHUB_API_TOKEN}`];
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

let issues = {};

async function executeQuery0(projects, index, cursor, startDate) {
  try {
    if (index >= endingProjectIndex) return;

    const [projectOwner, projectName] =
      projects[index].replace("\r", "").split("/");

    const repoFullName = `${projectOwner}/${projectName}`;

    if (!(repoFullName in tracking)) tracking[repoFullName] = 0;
    if (tracking[repoFullName]++ > 20000) return;

    while (tokenRemaining[tokenNum] !== -1 && tokenRemaining[tokenNum] < 5) {
      if (tokenReset[tokenNum] === "0") break;
      if (Date.now() > new Date(tokenReset[tokenNum]).getTime()) break;

      tokenNum = (tokenNum + 1) % tokens.length;
      graphqlWithAuth = graphql.defaults({
        headers: {
          authorization: `token ${tokens[tokenNum]}`
        }
      });
    }

    const { repository, rateLimit } = await graphqlWithAuth(
      projectQuery(projectOwner, projectName, cursor, startDate)
    );

    tokenReset[tokenNum] = rateLimit.resetAt;
    tokenRemaining[tokenNum] = rateLimit.remaining;

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

async function getIssues(owner, repo, startDate) {
  issues = {};

  const projects = [`${owner}/${repo}`];

  await executeQuery0(
    projects,
    currentProjectIndex,
    currentCursor,
    startDate
  );

  return Object.values(issues);
}

module.exports = {
  getIssues
};