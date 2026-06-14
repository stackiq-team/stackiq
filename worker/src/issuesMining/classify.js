function containsInactivityHint(issue) {
    const inactivityPatterns = [
        /closed\s+due\s+to\s+inactivity/i,
        /no\s+activity/i,
        /automatically\s+closed/i,
        /marked\s+as\s+stale/i,
        /issue\s+has\s+been\s+stale/i
    ];

    const commentsToCheck = [
        issue.lastcommentbeforeclosing?.body,
        issue.lastcommentafterclosing?.body,
        issue.firstcommentafterclosing?.body,
        ...(issue.links?.map(link => link?.comment?.body) || [])
    ];

    return commentsToCheck.some(comment =>
        comment && inactivityPatterns.some(pat => pat.test(comment))
    );
}

/**
 * Memory-based classifier
 * Input: summarized issues object
 * Output: { [issueNumber]: "fixed_by_devs" | "inactivity" | "other" }
 */
function classifyIssues(data) {
    const result = {};
    const toClassify = [];

    for (const key of Object.keys(data)) {
        const issue = data[key];

        if (
            issue.isClosedByPR ||
            issue.isClosedByCommit ||
            issue.isProbablyClosedByPR
        ) {
            result[issue.number] = "fixed_by_devs";
        }

        else if (
            (issue.closed_by?.login || '').toLowerCase().includes('bot') ||
            containsInactivityHint(issue)
        ) {
            result[issue.number] = "inactivity";
        }

        else {
            toClassify.push(issue);
        }
    }

    for (const issue of toClassify) {
        result[issue.number] = "other";
    }

    return result;
}

export default classifyIssues;