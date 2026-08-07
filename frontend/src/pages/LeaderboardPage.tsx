import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function IconStar() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={14} height={14} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
    </svg>
  );
}

function IconFork() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width={14} height={14} aria-hidden="true">
      <rect width="256" height="256" fill="none" />
      <circle cx="128" cy="188" r="28" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16" />
      <circle cx="188" cy="67.998" r="28" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16" />
      <circle cx="68" cy="67.998" r="28" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16" />
      <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16" d="M68,95.99756v8.002a24,24,0,0,0,24.00049,24l72-.00146a24,24,0,0,0,23.99951-24V95.99756" />
      <line x1="128.002" x2="128" y1="128" y2="160" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={14} height={14} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

function IconTools() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={14} height={14} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" />
    </svg>
  );
}
import {
  fetchLeaderboards,
  submitRepoAnalysis,
  type LeaderboardLists,
  type RepoLeaderboardItem,
} from "../service/ApiService";
import "./LeaderboardPage.css";
import { useTranslation, type TranslationKey } from "../i18n/LanguageContext";

function statusKey(status: string | null | undefined): TranslationKey {
  if (!status) return "common.unknown";
  const normalized = String(status).trim().toLowerCase();
  if (normalized === "pending") return "status.pending";
  if (normalized === "processing") return "status.processing";
  if (normalized === "completed") return "status.completed";
  if (normalized === "failed") return "status.failed";
  return "common.unknown";
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
  const { t } = useTranslation();
  const scoreLabel = isSubmitting
    ? t("leaderboard.analyzing")
    : repo.analysisScore != null
    ? String(repo.analysisScore)
    : t("common.unknown");

  const statusLabel = !repo.packageJsonPresent
    ? t("leaderboard.unsupportedFormat")
    : repo.analysisStatus
    ? t(statusKey(repo.analysisStatus))
    : repo.analysisResultToken
    ? t("status.pending")
    : t("common.unknown");

  return (
    <button
      type="button"
      className="leaderboard-repo-card leaderboard-repo-button"
      onClick={() => onSelect(repo)}
      disabled={disabled}
    >
      <div className="leaderboard-repo-header">
        <span className="repo-name">{repo.fullName}</span>
        <span className="repo-score">{scoreLabel}</span>
      </div>
      <div className="repo-description">{repo.description ?? t("leaderboard.noDescription")}</div>
      <div className="repo-meta">
        <span><IconStar /> {repo.stars}</span>
        <span><IconFork /> {repo.forks}</span>
        <span><IconEye /> {repo.watchers}</span>
      </div>
      <div className="repo-scores">
        <div className="repo-score-item">
          <span className="repo-score-value">{repo.popularityScore}</span>
          <span className="repo-score-label">{t("leaderboard.popularity")}</span>
        </div>
        <div className="repo-score-item">
          <span className="repo-score-value">{repo.activityScore}</span>
          <span className="repo-score-label">{t("leaderboard.activity")}</span>
        </div>
        <div className="repo-score-item">
          <span className="repo-score-value">{repo.compatibilityScore}</span>
          <span className="repo-score-label">{t("leaderboard.compatibility")}</span>
        </div>
      </div>
      <div className="repo-language">
        <span><IconTools /> {repo.primaryLanguage ?? t("common.unknown")}</span>
      </div>
      <div className="repo-status-row">
        <span className="repo-status-value">{t("leaderboard.analysisStatus", { status: statusLabel })}</span>
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
  const { t } = useTranslation();
  const [leaderboards, setLeaderboards] = useState<LeaderboardLists | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectionError, setSelectionError] = useState<string | null>(null);
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
        setError(data.message ?? t("leaderboard.unableToLoad"));
      }
    } catch (err) {
      setLeaderboards(null);
      setError(err instanceof Error ? err.message : t("leaderboard.unableToLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadLeaderboards();
  }, [loadLeaderboards]);

  const handleRepoSelect = useCallback(
    async (repo: RepoLeaderboardItem) => {
      setSelectionError(null);

      if (!repo.packageJsonPresent) {
        window.open(repo.url, "_blank", "noopener,noreferrer");
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
          return;
        }

        setSelectionError(result.message ?? t("leaderboard.unableToStart"));
      } catch (err) {
        setSelectionError(err instanceof Error ? err.message : t("leaderboard.unableToStart"));
      }
    },
    [navigate, t]
  );

  return (
    <div className="leaderboard-page">
      <div className="leaderboard-header">
        <div>
          <h1>{t("leaderboard.explore")}</h1>
          <p>{t("leaderboard.description")}</p>
        </div>
      </div>
      {loading && <div className="leaderboard-loading">Loading leaderboards…</div>}
      {error && <div className="leaderboard-error">{error}</div>}
      {selectionError && <div className="leaderboard-error">{selectionError}</div>}
      {leaderboards && (
        <RepoSection
          title={t("leaderboard.mostPopular")}
          repos={leaderboards.popular}
          onSelect={handleRepoSelect}
        />
      )}
    </div>
  );
}
