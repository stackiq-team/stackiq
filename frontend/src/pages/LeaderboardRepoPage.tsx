import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchLeaderboards, type RepoLeaderboardItem } from "../service/ApiService";
import "./LeaderboardRepoPage.css";

function formatNumber(value: number | null | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "-";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleDateString();
}

export default function LeaderboardRepoPage() {
  const { owner, repo } = useParams();
  const [repoData, setRepoData] = useState<RepoLeaderboardItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!owner || !repo) {
      setError("Repository not specified.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    fetchLeaderboards()
      .then((result) => {
        if (!result.success || !result.data) {
          setError(result.message ?? "Unable to load repository report.");
          return;
        }

        const fullName = `${owner}/${repo}`;
        const allRepos = [
          ...result.data.leaderboards.popular,
          ...result.data.leaderboards.active,
          ...result.data.leaderboards.bestRanked,
        ];

        const found = allRepos.find((item) => item.fullName.toLowerCase() === fullName.toLowerCase());
        if (!found) {
          setError("Repository report not found in the current leaderboard data.");
          return;
        }

        setRepoData(found);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Unable to load repository report.");
      })
      .finally(() => setLoading(false));
  }, [owner, repo]);

  if (loading) {
    return <div className="leaderboard-report-page">Loading repository report…</div>;
  }

  if (error) {
    return (
      <div className="leaderboard-report-page">
        <Link to="/leaderboard" className="back-link">
          ← Back to leaderboard
        </Link>
        <div className="report-error">{error}</div>
      </div>
    );
  }

  if (!repoData) {
    return <div className="leaderboard-report-page">Repository report not available.</div>;
  }

  return (
    <div className="leaderboard-report-page">
      <div className="report-topbar">
        <div>
          <Link to="/leaderboard" className="back-link">
            ← Back to leaderboard
          </Link>
          <h1>{repoData.fullName}</h1>
          <p>{repoData.description ?? "No description available."}</p>
        </div>
        <div className="report-score-card">
          <span className="report-score-label">StackIQ score</span>
          <span className="report-score-value">
            {repoData.analysisScore != null ? repoData.analysisScore : "Unknown"}
          </span>
        </div>
      </div>

      <div className="report-summary-grid">
        <article>
          <h2>Overall Score</h2>
          <p>This score is your repository's overall StackIQ score. It combines popularity, activity, and compatibility into a single internal ranking metric.</p>
        </article>
        <article>
          <h2>Score Breakdown</h2>
          <ul>
            <li>Popularity: {repoData.popularityScore}</li>
            <li>Activity: {repoData.activityScore}</li>
            <li>Compatibility: {repoData.compatibilityScore}</li>
          </ul>
        </article>
        <article>
          <h2>Repository Links</h2>
          <p>
            <a href={repoData.url} target="_blank" rel="noreferrer">
              Open on GitHub
            </a>
          </p>
        </article>
      </div>

      <section className="report-details-section">
        <h2>Repository Details</h2>
        <dl>
          <dt>Stars</dt>
          <dd>{formatNumber(repoData.stars)}</dd>
          <dt>Forks</dt>
          <dd>{formatNumber(repoData.forks)}</dd>
          <dt>Watchers</dt>
          <dd>{formatNumber(repoData.watchers)}</dd>
          <dt>Open issues</dt>
          <dd>{formatNumber(repoData.issues)}</dd>
          <dt>Pull requests</dt>
          <dd>{formatNumber(repoData.pullRequests)}</dd>
          <dt>Primary language</dt>
          <dd>{repoData.primaryLanguage ?? "Unknown"}</dd>
          <dt>License</dt>
          <dd>{repoData.license ?? "Unknown"}</dd>
          <dt>Created</dt>
          <dd>{formatDate(repoData.createdAt)}</dd>
          <dt>Last push</dt>
          <dd>{formatDate(repoData.pushedAt)}</dd>
          <dt>Topics</dt>
          <dd>{repoData.topics.length > 0 ? repoData.topics.join(", ") : "None"}</dd>
        </dl>
      </section>
    </div>
  );
}
