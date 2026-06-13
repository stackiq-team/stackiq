import { getIssues } from './issues.js';
import summarize from './summarize.js';
import classify from './classify.js';
import analyze from './analyze.js';
import count from './count.js';

export async function analyzeIssues(owner, repo, startDate) {
  const issues = await getIssues(owner, repo, startDate);

  const summarized = summarize(issues);
  const classified = classify(summarized);
  const analyzed = analyze(classified);
  const countResult = count(summarized);

  return {
    raw: summarized,
    classifications: analyzed,
    countResult
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
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error("Erreur durant l'exécution :", err.message);
      process.exit(1);
    }
  }

  run();
}