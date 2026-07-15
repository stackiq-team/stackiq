import { getIssues } from './issues.js';
import summarize from './summarize.js';
import analyze from './analyze.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function analyzeIssues(owner, repo, startDate) {
  const issues = await getIssues(owner, repo, startDate);

  const summarized = summarize(issues);
  const analyzed = analyze(summarized);

  return {
    raw: null, // You can add raw data retrieval here but the sizes can be quite large, so it's omitted for now.
    issueData: summarized,
    classifications: analyzed,
  };
}

if (process.argv[1].endsWith('run_all.js')) {
  if (process.argv.length < 5) {
    console.error("Usage: node run_all.js <owner> <repo> <start_date>");
    process.exit(1);
  }

  const [owner, repo, startDate] = process.argv.slice(2);

  async function run() {
    try {
      const result = await analyzeIssues(owner, repo, startDate);
      
      const filename = path.join(__dirname, 'data', `${repo}_issues_result.json`);
      fs.writeFileSync(filename, JSON.stringify(result, null, 2));
      console.log(`[output] Written to ${filename}`);
      
    } catch (err) {
      console.error("Erreur durant l'exécution :", err.message);
      process.exit(1);
    }
  }

  run();
}