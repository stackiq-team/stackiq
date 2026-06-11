function extractRepoName(url) {
    if (!url) return null;
    const match = url.match(/github\.com\/([^\/]+\/[^\/#?]+)/);
    return match ? match[1] : null;
}

function isProfileLink(url) {
    return /^https:\/\/github\.com\/[^\/]+\/?$/.test(url);
}

function isPullRequestLink(url) {
    return /github\.com\/[^\/]+\/[^\/]+\/pull\/\d+/.test(url);
}

function isCommitLink(url) {
    return /github\.com\/[^\/]+\/[^\/]+\/commit\/[a-f0-9]{6,40}/i.test(url);
}

function analyzeExternalLinks(issues) {
    const invalidPrefixes = [
        "user-attachments/",
        "notifications/",
        "settings/",
        "apps/",
        "features/",
        "organizations/",
        "site/"
    ];

    const excludeRepos = new Set([
        "home-assistant/core",
        "custom-components/alexa_media_player",
        "hacs/integration"
    ]);

    let prCount = 0;
    let commitCount = 0;

    const externalFromComments = {};
    const externalFromCrossrefs = {};

    for (const issueNumber in issues) {
        const issue = issues[issueNumber];
        const thisRepo = extractRepoName(issue.url);
        if (!thisRepo) continue;

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
                ) return;

                externalFromComments[linkedRepo] =
                    (externalFromComments[linkedRepo] || 0) + 1;
            });
        });

        issue.crossReferences?.forEach(ref => {
            const repo = ref.source?.repository;
            const isCrossRepo = ref.isCrossRepository;

            if (!repo || repo === thisRepo || !isCrossRepo) return;

            if (
                invalidPrefixes.some(prefix => repo.startsWith(prefix)) ||
                excludeRepos.has(repo)
            ) return;

            externalFromCrossrefs[repo] =
                (externalFromCrossrefs[repo] || 0) + 1;
        });
    }

    return {
        summary: {
            pull_requests: prCount,
            commits: commitCount
        },

        external_from_comments: Object.entries(externalFromComments)
            .sort((a, b) => b[1] - a[1])
            .map(([repo, count]) => ({ repo, count })),

        external_from_crossrefs: Object.entries(externalFromCrossrefs)
            .sort((a, b) => b[1] - a[1])
            .map(([repo, count]) => ({ repo, count }))
    };
}

module.exports = analyzeExternalLinks;