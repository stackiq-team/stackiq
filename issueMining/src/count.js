const fs = require('fs');

// === Input file from command-line arguments ===
const inputPath = process.argv[2];
if (!inputPath) {
    console.error("Usage: node script.js <issues_res.json>");
    process.exit(1);
}

// === Load the input JSON file ===
const issues = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));

// === Utility Functions ===

// Extracts the repository name from a GitHub URL
function extractRepoName(url) {
    const match = url.match(/github\.com\/([^\/]+\/[^\/#?]+)/);
    return match ? match[1] : null;
}

// Check if URL is a profile link
function isProfileLink(url) {
    return /^https:\/\/github\.com\/[^\/]+\/?$/.test(url);
}

// Check if URL is a pull request link
function isPullRequestLink(url) {
    return /github\.com\/[^\/]+\/[^\/]+\/pull\/\d+/.test(url);
}

// Check if URL is a commit link
function isCommitLink(url) {
    return /github\.com\/[^\/]+\/[^\/]+\/commit\/[a-f0-9]{6,40}/i.test(url);
}

// === Filters ===

// Prefixes to ignore (not actual repositories)
const invalidPrefixes = [
    "user-attachments/", "notifications/", "settings/",
    "apps/", "features/", "organizations/", "site/"
];

// Repositories to exclude explicitly
const excludeRepos = new Set([
    "home-assistant/core",
    "custom-components/alexa_media_player",
    "hacs/integration"
]);

// === Counters ===
let prCount = 0;
let commitCount = 0;
const externalFromComments = {};
const externalFromCrossrefs = {};

// === Main processing loop ===
for (const issueNumber in issues) {
    const issue = issues[issueNumber];
    const thisRepo = extractRepoName(issue.url);
    if (!thisRepo) continue;

    // Process comments
    issue.comments?.forEach(comment => {
        comment.links?.forEach(link => {
            if (!link.includes("github.com") || isProfileLink(link)) return;

            const linkedRepo = extractRepoName(link);
            if (!linkedRepo) return;

            if (linkedRepo === thisRepo) {
                if (isPullRequestLink(link)) prCount++;
                else if (isCommitLink(link)) commitCount++;
                return;
            }

            if (
                invalidPrefixes.some(prefix => linkedRepo.startsWith(prefix)) ||
                excludeRepos.has(linkedRepo)
            ) {
                return;
            }

            externalFromComments[linkedRepo] = (externalFromComments[linkedRepo] || 0) + 1;
        });
    });

    // Process cross-references
    issue.crossReferences?.forEach(ref => {
        const repo = ref.source?.repository;
        const isCrossRepo = ref.isCrossRepository;

        if (!repo || repo === thisRepo || !isCrossRepo) return;

        if (
            invalidPrefixes.some(prefix => repo.startsWith(prefix)) ||
            excludeRepos.has(repo)
        ) {
            return;
        }

        externalFromCrossrefs[repo] = (externalFromCrossrefs[repo] || 0) + 1;
    });
}

// === Write output files ===

// Summary CSV: pull requests and commits
fs.writeFileSync('summary_counts.csv', 'type,count\n' +
    `pull_requests,${prCount}\ncommits,${commitCount}\n`, 'utf-8');

// External repositories from comments
const commentsCSV = ['repository,count']
    .concat(
        Object.entries(externalFromComments)
            .sort((a, b) => b[1] - a[1])
            .map(([repo, count]) => `${repo},${count}`)
    )
    .join('\n');
fs.writeFileSync('external_comments.csv', commentsCSV, 'utf-8');

// External repositories from cross-references
const crossrefsCSV = ['repository,count']
    .concat(
        Object.entries(externalFromCrossrefs)
            .sort((a, b) => b[1] - a[1])
            .map(([repo, count]) => `${repo},${count}`)
    )
    .join('\n');
fs.writeFileSync('external_crossrefs.csv', crossrefsCSV, 'utf-8');
