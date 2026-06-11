// Load environment variables and required modules
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const axios = require('axios');
const fs = require('fs');
const dataDir = process.env.DATA_DIR || path.join(__dirname, '../data');

// Define output file and clear previous content
const outputCsvPath = path.join(dataDir, 'classifications.csv');
fs.writeFileSync(outputCsvPath, 'id,classification\n');

// Helper to wait between API retries
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Setup API endpoint and headers
const API_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const API_KEY = process.env.OPENAI_API_KEY || "YOUR GPT API KEY"; // Replace with environment-safe key

const axiosInstance = axios.create({
    baseURL: API_ENDPOINT,
    headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
    },
    timeout: 15000,
});

// Load issue data
const fileName = require(path.join(dataDir, '../data/issues_res.json'));

// Send issues to ChatGPT for classification
async function classifyWithChatGPT(issueBatch) {
    let retries = 0;

    const messages = [
        {
            role: 'user',
            content: `You are helping classify closed GitHub issues based on the reason for closure. You will receive full context for each issue, including title, body, author, labels, last comments, and cross-references.

Return a single classification label for each issue from the following set:

- fixed_by_devs: Closed by a merged pull request or commit, or explicitly resolved via linked PR/commit mentioned in comments or cross-references.
- inactivity: there is no new comment since a certain date or the one who closed it can be a robot too say that it closed due to inactivity.
- duplicate: The issue was marked as a duplicate of another issue (e.g., “duplicate of #1234”).
- workaround: A workaround or alternative fix was proposed (usually in comments), and the author reacted positively (e.g., 👍, ❤️).
- not_our_problem: The issue was blamed on an external system or another repo (e.g., “this is a bug in X”), or contains links to other GitHub projects.
- non_issue: The original author closed it themselves, often admitting it was a misunderstanding.
- not_enough_info: The issue was closed due to missing information, usually after labels like “waiting-for-info” or “needs more info”.
- other: Doesn’t clearly fit any of the above.

Common misclassifications:
- Do NOT classify as fixed_by_devs unless a PR or commit clearly fixed the issue, either via cross-reference or an explicit comment.
- If a comment proposes an alternative or workaround and is positively received (👍❤️), classify as workaround.
- If the issue was closed without receiving requested info (especially when labeled as needs-info or similar), classify as not_enough_info.
- If the issue was opened and closed by the same author with no fix, classify as non_issue.

Format your output strictly as a JSON object like:
{
  "123": "fixed_by_devs",
  "124": "duplicate"
}

Each issue contains metadata, comments, labels, and cross-references. Use labels like "needs-info", author identity, and cross-referenced PRs to guide your decision.

Now classify the following issues:\n\n`
        }
    ];

    for (let issue of issueBatch) {
        messages[0].content += `### Issue ${issue.number}:\n[Body]\n${issue.title}: ${issue.bodyText}\n\n[Author]\n${issue.author?.login || 'unknown'}\n\n[Closed By]\n${issue.closed_by?.login || 'unknown'}\n\n[Labels]\n${(issue.labels || []).map(l => l.name).join(', ') || 'None'}\n\n[Last Comment Before Closing]\n${issue.lastcommentbeforeclosing?.body || 'None'}\n\n[Last Comment After Closing]\n${issue.lastcommentafterclosing?.body || 'None'}\n\n[First Comment After Closing]\n${issue.firstcommentafterclosing?.body || 'None'}\n\n[Referenced Comments (via links)]\n${(Array.isArray(issue.links) ? issue.links.filter(link => link?.comment?.body).map(link => {
            const author = link.comment?.author?.login || 'unknown';
            const body = link.comment?.body || '';
            const url = link.url || '';
            return `- ${author} said:\n${body}\n(Link: ${url})`;
        }).join('\n\n') : 'None')}\n\n`;
    }

    while (retries < 3) {
        try {
            console.log(`Sending batch to OpenAI...`)
            const response = await axiosInstance.post('', {
                model: 'gpt-3.5-turbo',
                messages,
                max_tokens: 2000,
                temperature: 0
            });

            const content = response.data.choices[0].message.content.trim();
            const match = content.match(/\{[\s\S]*?\}/);

            console.log(`OpenAI response received, content: ${content.substring(0, 100)}`)

            if (match) {
                return JSON.parse(match[0]);
            } else {
                return null;
            }
        } catch (error) {
            console.error(`OpenAI error: ${error.response?.status} - ${error.message}`)
            if (error.response?.status === 429) {
                await delay(10000);
                retries += 1;
            } else {
                return null;
            }
        }
    }

    return null;
}

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

    for (let i = 0; i < toClassify.length; i += 5) {
        const batch = toClassify.slice(i, i + 5);
        const batchResult = await classifyWithChatGPT(batch);

        if (batchResult) {
            for (const [issueNumber, classification] of Object.entries(batchResult)) {
                fs.appendFileSync(outputCsvPath, `${issueNumber},${classification}\n`);
            }
        }

        await delay(2000);
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
