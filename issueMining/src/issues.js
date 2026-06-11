const { projectQuery, issueItemQuery } = require('./queries');
const { graphql } = require("@octokit/graphql");
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const dataDir = process.env.DATA_DIR || path.join(__dirname, '../data');

const tokens = [`${process.env.GITHUB_API_TOKEN}`];
const tokenReset = tokens.map(() => "0");
const tokenRemaining = tokens.map(() => -1);
let tokenNum = 0;

let endingProjectIndex = 300;
let currentProjectIndex = 0;
let currentCursor = "";
let nbItemsPerQuery = 100;
let tracking = {};

let input = "";
let output = "";
let start_date = "";

let graphqlWithAuth = graphql.defaults({
  headers: {
    authorization: `token ${tokens[0]}`
  }
});

async function executeQuery0(projects, index, cursor, startDate) {
  try {
    if (index >= endingProjectIndex) return;

    const [projectOwner, projectName] = projects[index].replace("\r", "").split("/");
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

    const { repository, rateLimit } = await graphqlWithAuth(projectQuery(projectOwner, projectName, cursor, startDate));
    tokenReset[tokenNum] = rateLimit.resetAt;
    tokenRemaining[tokenNum] = rateLimit.remaining;

    const edges = repository.issues.edges;
    const pageInfo = repository.issues.pageInfo;
    let json = "";

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

      if (node?.items?.totalCount > nbItemsPerQuery && node.items.pageInfo?.hasNextPage) {
        const extraItems = await getItems(projectOwner, projectName, cursor, node.items.pageInfo.endCursor, node.items.edges);
        idata.issues.edges[0].node.items.edges = extraItems;
      }

      const ijson = JSON.stringify(idata, null, 4);

      if (!fs.existsSync(output)) json = "[\n" + ijson;
      else json = ",\n" + ijson;

      fs.appendFile(output, json, 'utf8', () => {});
    }

    let nextIndex = index;
    if (pageInfo.hasNextPage) cursor = pageInfo.endCursor;
    else if (index < projects.length - 1) {
      cursor = "";
      nextIndex = index + 1;
    } else return;

    return executeQuery0(projects, nextIndex, cursor, startDate);

  } catch (err) {
    console.error('Error:', err.message);
    fs.appendFile(path.join(dataDir, `issues~${input.replace("/", "~")}~_errors.txt`), `#${index}: *${projects[index]}* | ${cursor}\n`, 'utf8', () => {});
    nbItemsPerQuery = 1;
    setTimeout(() => executeQuery0(projects, index, cursor, startDate), 5000);
  }
}

async function getItems(owner, name, cursor, nextCursor, items) {
  try {
    const { repository } = await graphqlWithAuth(issueItemQuery(owner, name, cursor, nextCursor));
    const newEdges = repository.issues.edges[0].node.items.edges;
    const itemKeys = new Set(items.map(item => item.node.id));

    for (const newItem of newEdges) {
      if (!itemKeys.has(newItem.node.id)) items.push(newItem);
    }

    const itemPageInfo = repository.issues.edges[0].node.items.pageInfo;
    if (itemPageInfo?.hasNextPage) {
      return getItems(owner, name, cursor, itemPageInfo.endCursor, items);
    } else return items;

  } catch (e) {
    // Swallow individual request errors silently
  }
}

async function executeQueries(srcFile) {
  fs.readFile(srcFile, 'utf8', (err, data) => {
    if (err) return;
    const projects = data.split("\n");
    executeQuery0(projects, currentProjectIndex, currentCursor, start_date);
  });
}

if (process.argv.length < 5) {
  input = process.argv[2];
  start_date = process.argv[3] || "";
  output = path.join(dataDir, `issues~${input.replace("/", "~")}~.json`);
  try { fs.unlinkSync(output); } catch (e) {}
  executeQuery0([input], currentProjectIndex, currentCursor, start_date);
} else {
  input = process.argv[2];
  executeQueries(input);
}

process.on('exit', () => {
  try {
    const content = fs.readFileSync(output, 'utf8').trim();
    if (!content.endsWith(']')) {
      const cleaned = content.replace(/,\s*$/, '');
      fs.writeFileSync(output, cleaned + '\n]', 'utf8');
    }
  } catch (e) {
    // Suppress any exit-time file errors
  }
});