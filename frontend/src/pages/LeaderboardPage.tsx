import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchLeaderboards,
  submitRepoAnalysis,
  type LeaderboardLists,
  type RepoLeaderboardItem,
} from "../service/ApiService";
import "./LeaderboardPage.css";

function formatAnalysisStatus(status: string | null | undefined): string {
  if (!status) return "Unknown";
  const normalized = String(status).trim().toLowerCase();
  if (normalized === "unknown") return "Unknown";
  if (normalized === "pending") return "Pending";
  if (normalized === "processing") return "Processing";
  if (normalized === "completed") return "Completed";
  if (normalized === "failed") return "Failed";
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

function RepoCard({
  repo,
  onSelect,
  isSubmitting,
  disabled,
}: {
  repo: RepoLeaderboardItem;
  onSelect: (repo: RepoLeaderboardItem) => void;
  isSubmitting: boolean;
  disabled: boolean;
}) {
  const scoreLabel = isSubmitting
    ? "Analyzing…"
    : repo.analysisScore != null
    ? String(repo.analysisScore)
    : "Unknown";

  const statusLabel = repo.analysisStatus
    ? formatAnalysisStatus(repo.analysisStatus)
    : repo.analysisResultToken
    ? "Pending"
    : "Unknown";

  return (
    <button
      type="button"
      className="leaderboard-repo-card leaderboard-repo-button"
      onClick={() => onSelect(repo)}
      disabled={disabled || !repo.packageJsonPresent}
    >
      <div className="leaderboard-repo-header">
        <span className="repo-name">{repo.fullName}</span>
        <span className="repo-score">{scoreLabel}</span>
      </div>
      <div className="repo-description">{repo.description ?? "No description"}</div>
      <div className="repo-meta">
        <span>⭐ {repo.stars}</span>
        <span>🍴 {repo.forks}</span>
        <span>👀 {repo.watchers}</span>
        <span>🛠 {repo.primaryLanguage ?? "Unknown"}</span>
      </div>
      {/* <div className="repo-tags">
        {repo.topics.slice(0, 5).map((topic) => (
          <span key={topic} className="repo-topic">
            {topic}
          </span>
        ))}
      </div> */}
      <div className="repo-scores">
        <div className="repo-score-item">
          <span className="repo-score-value">{repo.popularityScore}</span>
          <span className="repo-score-label">Popularity</span>
        </div>
        <div className="repo-score-item">
          <span className="repo-score-value">{repo.activityScore}</span>
          <span className="repo-score-label">Activity</span>
        </div>
        <div className="repo-score-item">
          <span className="repo-score-value">{repo.compatibilityScore}</span>
          <span className="repo-score-label">Compatibility</span>
        </div>
      </div>
      <div className="repo-status-row">
        <span className="repo-status-value">Analysis status: {statusLabel}</span>
      </div>
    </button>
  );
}

function RepoSection({
  title,
  repos,
  onSelect,
}: {
  title: string;
  repos: RepoLeaderboardItem[];
  onSelect: (repo: RepoLeaderboardItem) => void;
}) {
  return (
    <section className="leaderboard-section">
      <h2>{title}</h2>
      <div className="leaderboard-grid">
        {repos.map((repo) => (
          <RepoCard
            key={repo.fullName}
            repo={repo}
            onSelect={onSelect}
            isSubmitting={false}
            disabled={false}
          />
        ))}
      </div>
    </section>
  );
}

export default function LeaderboardPage() {
  const [leaderboards, setLeaderboards] = useState<LeaderboardLists | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const navigate = useNavigate();

  const loadLeaderboards = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLeaderboards(forceRefresh);
      if (data.success && data.data) {
        setLeaderboards(data.data.leaderboards);
      } else {
        setLeaderboards(null);
        setError(data.message ?? "Unable to load leaderboard");
      }
    } catch (err) {
      setLeaderboards(null);
      setError(err instanceof Error ? err.message : "Unable to load leaderboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLeaderboards();
  }, [loadLeaderboards]);

  const handleRepoSelect = useCallback(
    async (repo: RepoLeaderboardItem) => {
      setSubmitError(null);

      if (!repo.packageJsonPresent) {
        setSubmitError("No package.json detected for this repository.");
        return;
      }

      if (repo.analysisResultToken) {
        navigate(`/results/${encodeURIComponent(repo.analysisResultToken)}`);
        return;
      }

      try {
        const result = await submitRepoAnalysis(repo.owner, repo.name);
        if (result.success && result.data?.analysis?.resultToken) {
          navigate(`/results/${encodeURIComponent(result.data.analysis.resultToken)}`);
        } else {
          setSubmitError(result.message ?? "Unable to start repository analysis.");
        }
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "Unable to start repository analysis.");
      }
    },
    [navigate]
  );

  useEffect(() => {
    void loadLeaderboards();
  }, [loadLeaderboards]);

  return (
    <div className="leaderboard-page">
      <div className="leaderboard-header">
        <div>
          <h1>Leaderboard</h1>
          <p>Top repositories ranked by popularity, activity, and overall score.</p>
        </div>
        <button
          type="button"
          className="refresh-button"
          onClick={() => void loadLeaderboards(true)}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh leaderboard"}
        </button>
      </div>

      {loading && <div className="leaderboard-loading">Loading leaderboards…</div>}
      {error && <div className="leaderboard-error">{error}</div>}
      {submitError && <div className="leaderboard-error">{submitError}</div>}
      {leaderboards && (
        <>
          <RepoSection
            title="Top 3 Popular Repositories"
            repos={leaderboards.popular.slice(0, 3)}
            onSelect={handleRepoSelect}
          />
          <RepoSection
            title="Top 3 Active Repositories"
            repos={leaderboards.active.slice(0, 3)}
            onSelect={handleRepoSelect}
          />
          <RepoSection
            title="Top 3 Best Ranked Repositories"
            repos={leaderboards.bestRanked.slice(0, 3)}
            onSelect={handleRepoSelect}
          />
        </>
      )}
    </div>
  );
}
