const { execSync } = require('child_process');

if (process.argv.length < 5) {
    console.error("Usage: node run_all.js <owner> <repo> <start_date>");
    process.exit(1);
}

const owner = process.argv[2];
const repo = process.argv[3];
const startDate = process.argv[4];

const input = `${owner}/${repo}`;
const encoded = `${owner}~${repo}`;
const issueJson = `../data/issues~${encoded}~.json`;

try {
    execSync(`node issues.js ${input} ${startDate}`, { stdio: 'inherit' });

    execSync(`node summarize.js ${issueJson}`, { stdio: 'inherit' });

    execSync(`node classify.js ../data/issues_res.json`, { stdio: 'inherit' });

    execSync(`node analyze.js`, { stdio: 'inherit' });

    execSync(`node count.js ../data/issues_res.json`, { stdio: 'inherit' });

} catch (error) {
    console.error("Erreur durant l'exécution :", error.message);
}