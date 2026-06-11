// Load environment variables and required modules
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const fs = require('fs');
const dataDir = process.env.DATA_DIR || path.join(__dirname, '../data');

// Define output file and clear previous content
const outputCsvPath = path.join(dataDir, 'classifications.csv');
fs.writeFileSync(outputCsvPath, 'id,classification\n');

// Load issue data
const fileName = require(path.join(dataDir, '../data/issues_res.json'));

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


// Classify all issues and write results to CSV
async function classifyIssues(fileName) {
    const data = eval(fileName); // Ideally replaced with safer alternative
    const keys = Object.keys(data);
    const toClassify = [];

    for (let key of keys) {
        const issue = data[key];

        // classify localy without the need of the API
        if (issue.isClosedByPR || issue.isClosedByCommit || issue.isProbablyClosedByPR) {
            fs.appendFileSync(outputCsvPath, `${issue.number},fixed_by_devs\n`);
        } else if (
            (issue.closed_by?.login || '').toLowerCase().includes('bot') ||
            containsInactivityHint(issue)
        ) {
            fs.appendFileSync(outputCsvPath, `${issue.number},inactivity\n`);
        } else {
            toClassify.push({ number: issue.number, ...issue });
        }

    }

    for (let issue of toClassify) {
        fs.appendFileSync(outputCsvPath, `${issue.number},other\n`);
    }
}

// Gracefully handle manual interruption
process.on('SIGINT', () => {
    process.exit();
});

// Start the classification process
(async () => {
    await classifyIssues(fileName);
})();
