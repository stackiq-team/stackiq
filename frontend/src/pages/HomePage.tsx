import { useState, useCallback } from "react";
import "./HomePage.css";
import { sendJsonForAnalysis } from "../service/ApiService";
import { useTranslation } from "../i18n/LanguageContext";

export default function JsonDropZone() {
  const { t } = useTranslation();
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  
  const validateEmail = (value: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(value);
  };

  const handleEmailChange = (
    event: React.ChangeEvent<HTMLInputElement>
    ) => {
    const value = event.target.value;

    setEmail(value);

    if (value !== "" && !validateEmail(value)) {
      setEmailError(t("home.invalidEmail"));
    } else {
      setEmailError("");
    }
  };

  const handleFile = useCallback((file: File | undefined) => {
    setError("");
    setResultUrl("");

    if (!file) return;

    if (!file.name.endsWith(".json")) {
      setError(t("home.uploadJsonFile"));
      return;
    }

    const reader = new FileReader();

    reader.onload = (event: ProgressEvent<FileReader>) => {
      try {
        const result = event.target?.result;

        if (typeof result !== "string") {
          setError(t("home.couldNotReadFile"));
          return;
        }

        const parsed = JSON.parse(result);

        setFileName(file.name);
        setJsonText(JSON.stringify(parsed, null, 2));
      } catch {
        setError(t("home.invalidJsonFile"));
      }
    };

    reader.readAsText(file);
  }, [t]);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);

    const file = event.dataTransfer.files[0];
    handleFile(file);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => {
    setDragActive(false);
  };

  const handleInputChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    handleFile(file);
  };

  const handleJsonTextChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    setJsonText(event.target.value);
    setFileName("");
    setError("");
    setResultUrl("");
  };

  const handleSubmit = async () => {
    const trimmedJsonText = jsonText.trim();

    if (!trimmedJsonText) {
      setError(t("home.uploadOrPaste"));
      return;
    }

    if (email.trim() !== "" && !validateEmail(email)) {
      setEmailError(t("home.invalidEmail"));
      return;
    }

    try {
      JSON.parse(trimmedJsonText);
    } catch {
      setError(t("home.enterValidJson"));
      return;
    }

    setLoading(true);

    const jsonFile = new File(
      [trimmedJsonText],
      fileName || "package.json",
      { type: "application/json" }
    );

    const result = await sendJsonForAnalysis(
      email,
      jsonFile
    );

    setLoading(false);

    if (result.success && result.data?.analysis.resultToken) {
      setResultUrl(
        `/results/${encodeURIComponent(
          result.data.analysis.resultToken
        )}`
      );
    } else if (result.success) {
      setError(t("home.noResultToken"));
    } else {
      setError(result.message || t("home.uploadFailed"));
    }
  };

  return (
    <section className="scanner-page">
      <div className="scanner-hero">
        <div>
          <h1>{t("home.heroTitle")}</h1>
          <p className="hero-copy">
            {t("home.heroCopy")}
          </p>
        </div>
      </div>

      <div className="scanner-grid">
        <div className="scanner-panel">
          {fileName && (
            <div className="panel-header">
              <span className="file-pill">{fileName}</span>
            </div>
          )}

          <div className="form-section emailSection">
            <div className="section-kicker">{t("home.optionalNotification")}</div>
            <label className="emailLabel">{t("home.emailLabel")}</label>
            <p className="emailHelp">
              {t("home.emailHelp")}
            </p>
            <input
              type="email"
              value={email}
              onChange={handleEmailChange}
              placeholder={t("home.emailPlaceholder")}
              className={`emailInput ${emailError ? "inputError" : ""}`}
            />
            {emailError && <div className="error">{emailError}</div>}
          </div>

          <div className="form-section">
            <div className="section-kicker">{t("home.packageJson")}</div>
            <div
              className={`dropZone ${dragActive ? "dropZoneActive" : ""}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleInputChange}
                className="input"
                id="json-upload"
              />
              <label className="label" htmlFor="json-upload">
                <span className="upload-icon">JSON</span>
                <span>{t("home.dropJson")}</span>
              </label>
            </div>

            {fileName && (
              <div className="success">
                {t("home.loadedFile", { fileName })}
              </div>
            )}
            {error && <div className="error">{error}</div>}

            <textarea
              className="jsonTextArea"
              value={jsonText}
              onChange={handleJsonTextChange}
              placeholder={`{\n  "dependencies": {\n    "express": "^5.2.1"\n  }\n}`}
              spellCheck={false}
            />
          </div>

          <div className="scanner-actions">
            <p className="submit-help">
              {t("home.submitHelp")}
            </p>
            <div className="scanner-action-buttons">
              <button
                className="submitButton"
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? t("home.analyzing") : t("home.analyzeStack")}
              </button>

              {resultUrl && (
                <a
                  className="resultButton"
                  href={resultUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("home.openResult")}
                </a>
              )}
            </div>
          </div>
        </div>

        <aside className="home-output-panel">
          <h2>{t("home.analysisFlow")}</h2>
          <div className="home-output-list">
            <div className="home-output-item">
              <span className="home-output-step signal-blue">1</span>
              <div>
                <strong>{t("home.resolvePackages")}</strong>
                <p>{t("home.resolvePackagesCopy")}</p>
              </div>
            </div>
            <div className="home-output-item">
              <span className="home-output-step signal-orange">2</span>
              <div>
                <strong>{t("home.scoreDependencyHealth")}</strong>
                <p>{t("home.scoreDependencyHealthCopy")}</p>
              </div>
            </div>
            <div className="home-output-item">
              <span className="home-output-step signal-green">3</span>
              <div>
                <strong>{t("home.checkRelationships")}</strong>
                <p>{t("home.checkRelationshipsCopy")}</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
