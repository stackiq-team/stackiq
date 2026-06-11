import { getIssues } from './issues.js';
import summarize from './summarize.js';
import classify from './classify.js';
import analyze from './analyze.js';
import count from './count.js';

if (process.argv.length < 5) {
    console.error("Usage: node run_all.js <owner> <repo> <start_date>");
    process.exit(1);
}

const owner = process.argv[2];
const repo = process.argv[3];
const startDate = process.argv[4];

async function run() {
    try {
        const issues = await getIssues(owner, repo, startDate);

        const summarized = summarize(issues);

        const classified = classify(summarized);

        const analyzed = analyze(classified);

        const countResult = count(summarized);

        console.log(JSON.stringify({ classifications: analyzed, countResult }, null, 2))

    } catch (err) {
        console.error("Erreur durant l'exécution :", err.message);
        process.exit(1);
    }
}

run();