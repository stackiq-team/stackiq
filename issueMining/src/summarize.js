// Required modules
const fs = require('fs');

// Input/output configuration
const inputPath = process.argv[2];
const outputPath = process.argv[3] || '../data/issues_res.json';
const jsonData = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));

// Sets to track how issues were closed
let closed_bypr = new Set();
let closed_bycommit = new Set();
let issues = {};

// Extract repository owner and name from the data
function getRepoInfo(data) {
    for (let key in data) {
        const repo = data[key].issues.edges?.[0]?.node?.repository;
        if (repo) {
            return {
                repoName: repo.name,
                repoOwner: repo.owner?.login
            };
        }
    }
    return { repoName: '', repoOwner: '' };
}

// Determine if an issue was likely closed by a PR with relevant keywords and links
function isProbablyFixedByPR(comments) {
    const keywords = ["fix", "fixed", "fixes", "resolve", "resolved", "resolves", "close", "closed", "closes"];
    const keywordRegex = new RegExp(`\b(${keywords.join('|')})\b`, 'i');
    const prRegex = /github\.com\/[^\/]+\/[^\/]+\/pull\/\d+/;
    const commitRegex = /github\.com\/[^\/]+\/[^\/]+\/commit\/[a-f0-9]{6,40}/i;

    for (let comment of comments) {
        const text = comment.body || '';
        if (!text) continue;

        const hasKeyword = keywordRegex.test(text);
        const hasLink = comment.links?.some(link => prRegex.test(link) || commitRegex.test(link));

        if (hasKeyword && hasLink) return true;
    }
    return false;
}

// Return the first comment after an issue was closed (if any)
function firstCommentafterClosing(issueData) {
    const nodes = issueData.items.edges;
    let lastClosedIndex = -1;
    for (let i = nodes.length - 1; i >= 0; i--) {
        if (nodes[i].node.__typename === 'ClosedEvent') {
            lastClosedIndex = i;
            break;
        }
    }

    if (lastClosedIndex === -1) return null;

    for (let i = lastClosedIndex + 1; i < nodes.length; i++) {
        const node = nodes[i].node;
        if (node.__typename === 'IssueComment') {
            const emojis = (node.reactionGroups || []).filter(r => r.createdAt != null);
            return {
                emoji: emojis,
                body: node.bodyText,
                url: node.url,
                author: node.author,
                date: node.createdAt
            };
        }
    }
    return null;
}

// Return the last comment after an issue was closed (if any)
function lastCommentafterClosing(issueData) {
    const nodes = issueData.items.edges;
    let lastClosedIndex = -1;
    for (let i = nodes.length - 1; i >= 0; i--) {
        if (nodes[i].node.__typename === 'ClosedEvent') {
            lastClosedIndex = i;
            break;
        }
    }

    if (lastClosedIndex === -1) return null;

    let lastComment = null;
    for (let i = lastClosedIndex + 1; i < nodes.length; i++) {
        const node = nodes[i].node;
        if (node.__typename === 'IssueComment') {
            const emojis = (node.reactionGroups || []).filter(r => r.createdAt != null);
            lastComment = {
                emoji: emojis,
                body: node.bodyText,
                url: node.url,
                author: node.author,
                date: node.createdAt
            };
        }
    }
    return lastComment;
}

// Return the last comment before an issue was closed (if any)
function lastCommentbeforeclosing(issueData) {
    const nodes = issueData.items.edges;
    let lastClosedIndex = -1;
    for (let i = nodes.length - 1; i >= 0; i--) {
        if (nodes[i].node.__typename === 'ClosedEvent') {
            lastClosedIndex = i;
            break;
        }
    }

    if (lastClosedIndex === -1) return null;

    for (let i = lastClosedIndex - 1; i >= 0; i--) {
        const node = nodes[i].node;
        if (node.__typename === 'IssueComment') {
            const emojis = (node.reactionGroups || []).filter(r => r.createdAt != null);
            const html = node.bodyHTML || '';
            const linkRegex = /<a\s+(?:[^>]*?\s+)?href="([^"]*)"/g;
            const links = [...html.matchAll(linkRegex)].map(match => match[1]);

            return {
                emoji: emojis,
                body: node.bodyText,
                url: node.url,
                author: node.author,
                date: node.createdAt,
                isCommentAfterClosingissue: false,
                links
            };
        }
    }
    return null;
}

// Populate closed_bypr and closed_bycommit sets
function solvedBypr(jsonData) {
    for (let item in jsonData) {
        const issueNode = jsonData[item].issues.edges?.[0]?.node;
        if (!issueNode) continue;

        const nodes = issueNode.items?.edges || [];
        let isClosedByPR = false;
        let isClosedByCommit = false;

        for (let { node } of nodes) {
            if (!node) continue;
            if (node.__typename === 'ClosedEvent' && node.closer) {
                if (node.closer.__typename === 'PullRequest') isClosedByPR = true;
                else isClosedByCommit = true;
            }
            if (node.__typename === 'CrossReferencedEvent' && node.source?.__typename === 'PullRequest' && node.source.merged) {
                isClosedByPR = true;
            }
        }

        const issueNumber = issueNode.number;
        if (isClosedByPR) closed_bypr.add(issueNumber);
        else if (isClosedByCommit) closed_bycommit.add(issueNumber);
    }
}

// Collect issue comments with emojis and filter links to PRs/commits
function allcmntsWithemoji(jsonData, repoOwner, repoName) {
    const invalidPrefixes = ["user-attachments/", "notifications/", "settings/", "apps/", "features/", "organizations/", "site/"];

    for (let item in jsonData) {
        const nodeData = jsonData[item]?.issues?.edges?.[0]?.node;
        if (!nodeData || !nodeData.items?.edges) continue;

        const issue = {
            url: nodeData.url,
            number: nodeData.number,
            author: nodeData.author,
            bodyText: nodeData.bodyText,
            published_date: nodeData.publishedAt,
            closed_date: nodeData.closedAt,
            labels: nodeData.labels?.nodes || [],
            comments: [],
            crossReferences: [],
            isClosedByPR: closed_bypr.has(nodeData.number),
            isClosedByCommit: closed_bycommit.has(nodeData.number)
        };

        let isClosed = false;

        for (let { node } of nodeData.items.edges) {
            if (node.__typename === 'IssueComment') {
                const emojis = (node.reactionGroups || []).filter(r => r.createdAt != null);
                const html = node.bodyHTML || '';
                const linkRegex = /<a\s+(?:[^>]*?\s+)?href="([^"]*)"/g;
                const links = [...html.matchAll(linkRegex)].map(match => match[1]);

                const filteredLinks = links.filter(link => {
                    if (!link.includes("github.com")) return false;
                    if (/^https:\/\/github\.com\/[^\/]+\/?$/.test(link)) return false;
                    if (new RegExp(`github\.com/${repoOwner}/${repoName}/(?!pull|commit)`).test(link)) return false;
                    if (invalidPrefixes.some(prefix => link.includes(`github.com/${prefix}`))) return false;
                    return /\/pull\/\d+/.test(link) || /\/commit\/[a-f0-9]{6,40}/i.test(link);
                });

                if (filteredLinks.some(link => /\/pull\/\d+/.test(link) || /\/commit\/[a-f0-9]{6,40}/i.test(link))) {
                    issue.comments.push({
                        emoji: emojis,
                        body: node.bodyText,
                        url: node.url,
                        author: node.author,
                        date: node.createdAt,
                        isCommentAfterClosingissue: isClosed,
                        links: filteredLinks
                    });
                }
            }

            if (node.__typename === 'ClosedEvent') {
                issue.closed_by = node.actor;
                isClosed = true;
            }

            if (node.__typename === 'CrossReferencedEvent') {
                issue.crossReferences.push({
                    referencedAt: node.referencedAt,
                    isCrossRepository: node.isCrossRepository,
                    willCloseTarget: node.willCloseTarget,
                    actor: node.actor,
                    source: {
                        __typename: node.source.__typename,
                        number: node.source.number,
                        title: node.source.title,
                        url: node.source.url,
                        author: node.source.author,
                        repository: node.source.repository?.nameWithOwner
                    }
                });
            }
        }

        issue.firstcommentafterclosing = firstCommentafterClosing(nodeData);
        issue.lastcommentafterclosing = lastCommentafterClosing(nodeData);
        issue.lastcommentbeforeclosing = lastCommentbeforeclosing(nodeData);
        issue.isProbablyClosedByPR = isProbablyFixedByPR(issue.comments);

        issues[String(nodeData.number)] = issue;
    }
}

// === Main Execution ===
const { repoOwner, repoName } = getRepoInfo(jsonData);
solvedBypr(jsonData);
allcmntsWithemoji(jsonData, repoOwner, repoName);
fs.writeFileSync(outputPath, JSON.stringify(issues, null, 4));
