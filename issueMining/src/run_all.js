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

const input = `${owner}/${repo}`;
const encoded = `${owner}~${repo}`;
const issueJson = path.join(dataDir, `issues~${encoded}~.json`);
const env = { ...process.env, DATA_DIR: dataDir };

try {
    execSync(`node ${path.join(scriptsDir, 'issues.js')} ${input} ${startDate}`, { stdio: 'inherit', env });
    execSync(`node ${path.join(scriptsDir, 'summarize.js')} ${issueJson}`, { stdio: 'inherit', env });
    execSync(`node ${path.join(scriptsDir, 'classify.js')} ${path.join(dataDir, 'issues_res.json')}`, { stdio: 'inherit', env });
    execSync(`node ${path.join(scriptsDir, 'analyze.js')}`, { stdio: 'inherit', env });
    execSync(`node ${path.join(scriptsDir, 'count.js')} ${path.join(dataDir, 'issues_res.json')}`, { stdio: 'inherit', env });
} catch (error) {
    console.error("Erreur durant l'exécution :", error.message);
}