// Required modules
const path = require('path');

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

function isProbablyFixedByPR(comments) {
    const keywords = ["fix", "fixed", "fixes", "resolve", "resolved", "resolves", "close", "closed", "closes"];
    const keywordRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'i');
    const prRegex = /github\.com\/[^\/]+\/[^\/]+\/pull\/\d+/;
    const commitRegex = /github\.com\/[^\/]+\/[^\/]+\/commit\/[a-f0-9]{6,40}/i;

    for (let comment of comments) {
        const text = comment.body || '';
        if (!text) continue;

        const hasKeyword = keywordRegex.test(text);
        const hasLink = comment.links?.some(link =>
            prRegex.test(link) || commitRegex.test(link)
        );

        if (hasKeyword && hasLink) return true;
    }
    return false;
}

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
            const emojis = (node.reactionGroups || [])
                .filter(r => r.createdAt != null);

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

function lastCommentafterClosing(issueData) {
    const nodes = issueData.items.edges;
    let lastClosedIndex = -1;
    let lastComment = null;

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
            const emojis = (node.reactionGroups || [])
                .filter(r => r.createdAt != null);

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
            const emojis = (node.reactionGroups || [])
                .filter(r => r.createdAt != null);

            const html = node.bodyHTML || '';
            const linkRegex = /<a\s+(?:[^>]*?\s+)?href="([^"]*)"/g;
            const links = [...html.matchAll(linkRegex)].map(m => m[1]);

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

function solvedBypr(data) {
    const closed_bypr = new Set();
    const closed_bycommit = new Set();

    for (let item of data) {
        const issueNode = item.issues.edges?.[0]?.node;
        if (!issueNode) continue;

        const nodes = issueNode.items?.edges || [];
        let isClosedByPR = false;
        let isClosedByCommit = false;

        for (let { node } of nodes) {
            if (!node) continue;
            if (node.__typename === 'ClosedEvent' && node.closer) {
                if (node.closer.__typename === 'PullRequest') {
                    isClosedByPR = true;
                } else {
                    isClosedByCommit = true;
                }
            }

            if (
                node.__typename === 'CrossReferencedEvent' &&
                node.source?.__typename === 'PullRequest' &&
                node.source.merged
            ) {
                isClosedByPR = true;
            }
        }

        const issueNumber = issueNode.number;
        if (isClosedByPR) closed_bypr.add(issueNumber);
        else if (isClosedByCommit) closed_bycommit.add(issueNumber);
    }

    return { closed_bypr, closed_bycommit };
}

function allcmntsWithemoji(data, repoOwner, repoName, closed_bypr, closed_bycommit) {
    const issues = {};

    const invalidPrefixes = [
        "user-attachments/",
        "notifications/",
        "settings/",
        "apps/",
        "features/",
        "organizations/",
        "site/"
    ];

    for (let item of data) {
        const nodeData = item?.issues?.edges?.[0]?.node;
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
            isClosedByCommit: closed_bycommit.has(nodeData.number),
            closed_by: nodeData.closed_by || null
        };

        let isClosed = false;

        for (let { node } of nodeData.items.edges) {
            if (!node) continue;
            if (node.__typename === 'IssueComment') {
                const emojis = (node.reactionGroups || [])
                    .filter(r => r.createdAt != null);

                const html = node.bodyHTML || '';
                const linkRegex = /<a\s+(?:[^>]*?\s+)?href="([^"]*)"/g;
                const links = [...html.matchAll(linkRegex)].map(m => m[1]);

                const filteredLinks = links.filter(link => {
                    if (!link.includes("github.com")) return false;
                    if (/^https:\/\/github\.com\/[^\/]+\/?$/.test(link)) return false;
                    if (new RegExp(`github\\.com/${repoOwner}/${repoName}/(?!pull|commit)`).test(link)) return false;
                    if (invalidPrefixes.some(p => link.includes(`github.com/${p}`))) return false;

                    return /\/pull\/\d+/.test(link) ||
                           /\/commit\/[a-f0-9]{6,40}/i.test(link);
                });

                if (filteredLinks.some(l => /\/pull\/\d+/.test(l) || /\/commit\/[a-f0-9]{6,40}/i.test(l))) {
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
                isClosed = true;
                issue.closed_by = node.actor;
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
    return issues;
}

function summarizeIssues(data) {
    const { repoOwner, repoName } = getRepoInfo(data);
    const { closed_bypr, closed_bycommit } = solvedBypr(data);

    return allcmntsWithemoji(
        data,
        repoOwner,
        repoName,
        closed_bypr,
        closed_bycommit
    );
}

module.exports = summarizeIssues;