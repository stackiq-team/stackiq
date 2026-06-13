import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { fetchAnalysisByResultToken } from "../service/ApiService";
import type { AnalysisLookupResponse } from "../service/ApiService";
import "./DependencyDetailPage.css";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

interface DependencyDetail {
  name: string;
  versionRequirement: string;
  type: "DEPENDENCY" | "DEV_DEPENDENCY";
  score: number;
  riskLevel: RiskLevel;
}

function riskClassName(risk: RiskLevel): string {
  if (risk === "LOW") return "risk-low";
  if (risk === "MEDIUM") return "risk-medium";
  return "risk-high";
}

function riskLabel(risk: RiskLevel): string {
  if (risk === "LOW") return "Faible";
  if (risk === "MEDIUM") return "Moyen";
  return "Élevé";
}

export default function DependencyDetailPage() {
  const { resultToken, dependencyName } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dependency, setDependency] = useState<DependencyDetail | null>(null);

  const load = async () => {
    if (!resultToken || !dependencyName) {
      setError("Missing result token or dependency name in URL.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetchAnalysisByResultToken(resultToken);

      if (!response.success || !response.data?.analysis?.result) {
        setError(response.message || "Unable to load analysis.");
        setLoading(false);
        return;
      }

      const decodedName = decodeURIComponent(dependencyName);
      const analysisResult = response.data.analysis.result;
      const depScore = analysisResult.dependencyScores.find(
        (ds) => ds.dependency.name === decodedName
      );

      if (!depScore) {
        setError("Dependency not found in analysis results.");
        setLoading(false);
        return;
      }

      setDependency({
        name: depScore.dependency.name,
        versionRequirement: depScore.dependency.versionRequirement,
        type: depScore.dependency.type,
        score: depScore.score,
        riskLevel: depScore.riskLevel,
      });
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [resultToken, dependencyName]);

  if (loading) {
    return (
      <section className="dependency-detail-page">
        <h1>Détails de la Dépendance</h1>
        <p>Chargement des informations...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="dependency-detail-page">
        <h1>Détails de la Dépendance</h1>
        <p className="error-text">{error}</p>
        <div className="detail-actions">
          <button className="button" onClick={() => void load()}>
            Réessayer
          </button>
          <Link className="button button-secondary" to={`/results/${resultToken}`}>
            Retour aux résultats
          </Link>
        </div>
      </section>
    );
  }

  if (!dependency) {
    return (
      <section className="dependency-detail-page">
        <h1>Détails de la Dépendance</h1>
        <p>Aucune dépendance trouvée.</p>
      </section>
    );
  }

  return (
    <section className="dependency-detail-page">
      <header className="detail-header">
        <div className="header-content">
          <h1>{dependency.name}</h1>
          <span className={`type-badge type-${dependency.type.toLowerCase()}`}>
            {dependency.type === "DEPENDENCY" ? "Dépendance" : "Dev Dépendance"}
          </span>
        </div>
        <button 
          className="button button-back"
          onClick={() => navigate(`/results/${resultToken}`)}
        >
          ← Retour
        </button>
      </header>

      <article className="info-section">
        <h2>Informations Générales</h2>
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">Version Requise</span>
            <span className="info-value">{dependency.versionRequirement}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Type</span>
            <span className="info-value">
              {dependency.type === "DEPENDENCY" ? "Dépendance" : "Dev Dépendance"}
            </span>
          </div>
        </div>
      </article>

      <article className="metrics-section">
        <h2>Score et Niveau de Risque</h2>
        <div className="metrics-grid">
          <div className="metric-card score-card">
            <h3>Score de Dépendance</h3>
            <div className="score-display">
              <span className="score-value">{dependency.score}</span>
              <span className="score-max">/100</span>
            </div>
            <div className="score-bar">
              <div 
                className={`score-fill ${
                  dependency.score >= 80 ? 'score-low' :
                  dependency.score >= 60 ? 'score-medium' :
                  'score-high'
                }`}
                style={{ width: `${dependency.score}%` }}
              ></div>
            </div>
          </div>

          <div className="metric-card risk-card">
            <h3>Niveau de Risque</h3>
            <p className={`risk-level ${riskClassName(dependency.riskLevel)}`}>
              {riskLabel(dependency.riskLevel)}
            </p>
            <div className="risk-description">
              {dependency.riskLevel === "LOW" && (
                <p>La dépendance présente un faible risque pour votre projet.</p>
              )}
              {dependency.riskLevel === "MEDIUM" && (
                <p>La dépendance présente un risque moyen. Vérifiez les mises à jour disponibles.</p>
              )}
              {dependency.riskLevel === "HIGH" && (
                <p>La dépendance présente un risque élevé. Envisagez une mise à jour ou un remplacement.</p>
              )}
            </div>
          </div>
        </div>
      </article>

      <article className="github-section">
        <h2>Métriques GitHub</h2>
        <div className="github-metrics">
          <div className="metric-placeholder">
            <p>Les métriques GitHub seront bientôt disponibles</p>
            <ul>
              <li>⭐ Nombre d'étoiles</li>
              <li>👁️ Watchers</li>
              <li>🐛 Problèmes ouverts</li>
              <li>📅 Dernière mise à jour</li>
              <li>📄 Licence</li>
            </ul>
          </div>
        </div>
      </article>

      <div className="detail-actions">
        <Link className="button" to={`/results/${resultToken}`}>
          Voir tous les résultats
        </Link>
      </div>
    </section>
  );
}
