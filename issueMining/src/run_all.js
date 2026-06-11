const { execSync } = require('child_process');
const path = require('path');
const dataDir = process.env.DATA_DIR || path.join(__dirname, '../data');
const scriptsDir = __dirname;

if (process.argv.length < 5) {
    console.error("Usage: node run_all.js <owner> <repo> <start_date>");
    process.exit(1);
}

const owner = process.argv[2];
const repo = process.argv[3];
const startDate = process.argv[4];

async function run() {
    try {
        const issuesModule = require('./issues');

        const issues = await issuesModule.getIssues(owner, repo, startDate);

        const summarize = require('./summarize');
        const summarized = summarize(issues);

        const classify = require('./classify');
        const classified = classify(summarized);

        const analyze = require('./analyze');
        const analyzed = analyze(classified);

        const count = require('./count');
        const result = count(summarized);

        console.log(JSON.stringify(analyzed, null, 2));

    } catch (err) {
        console.error("Erreur durant l'exécution :", err.message);
        process.exit(1);
    }
}

run();