import {
  type NormalizedInputs,
  type RiskLevel,
} from "./../dependencyScore.js";
import { MailtrapClient } from "mailtrap";

type AnalysisResultData = {
  globalScore: number;
  riskLevel: string;
  summary: string;
  dependencyScores?: DependencyScoreData[];
};

type DependencyScoreData = {
  dependencyId: string;
  dependencyName?: string;
  score: number;
  riskLevel: RiskLevel;
  breakdown?: {
    popularityScore: number | null;
    maintenanceScore: number | null;
    resolutionQualityScore: number | null;
    normalizedInputs: NormalizedInputs;
  };
  warnings?: string[];
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getResultUrl(analysisPageToken: string) {
  const baseUrl = "https://stackiq.dev";
  return analysisPageToken.trim()
    ? `${baseUrl}/results/${encodeURIComponent(analysisPageToken)}`
    : `${baseUrl}/results`;
}

function getRiskColor(riskLevel: RiskLevel) {
  if (riskLevel === "HIGH") return { text: "#dc2626", border: "#fecaca" };
  if (riskLevel === "MEDIUM") return { text: "#ca8a04", border: "#fde68a" };
  return { text: "#16a34a", border: "#bbf7d0" };
}

function renderDependencyCards(dependencyScores?: DependencyScoreData[]) {
  if (!dependencyScores || dependencyScores.length === 0) {
    return `
      <div style="padding: 16px; border: 1px solid #fed7aa; border-radius: 12px; background: #ffffff; color: #6b7280;">
        No dependency scores were included in this analysis.
      </div>
    `;
  }

  return dependencyScores
    .map((dependency) => {
      const riskColor = getRiskColor(dependency.riskLevel);
      const dependencyTitle = dependency.dependencyName ?? dependency.dependencyId;
      const warnings = dependency.warnings?.length
        ? `<ul style="margin: 8px 0 0; padding-left: 18px; color: #6b7280;">${dependency.warnings
            .map((warning) => `<li>${escapeHtml(warning)}</li>`)
            .join("")}</ul>`
        : `<p style="margin: 8px 0 0; color: #6b7280;">No warnings.</p>`;

      return `
        <div style="border: 1px solid #e5e7eb; border-radius: 14px; padding: 18px; background: #ffffff; margin-top: 12px;">
          <div style="display: flex; justify-content: space-between; gap: 12px; align-items: baseline; flex-wrap: wrap;">
            <strong style="font-size: 16px; color: #374151;">${escapeHtml(dependencyTitle)}</strong>
            <span style="padding: 6px 10px; border-radius: 999px; background: #ffffff; border: 1px solid ${riskColor.border}; color: ${riskColor.text}; font-size: 12px; font-weight: 700;">
              ${escapeHtml(dependency.riskLevel)}
            </span>
          </div>
          <div style="margin-top: 12px; display: flex; flex-direction: column; gap: 10px; font-size: 14px; color: #4b5563;">
            <div><strong style="color: #1f2937;">Score:</strong> ${dependency.score}</div>
            <div><strong style="color: #1f2937;">Dependency ID:</strong> ${escapeHtml(dependency.dependencyId)}</div>
          </div>
          <div style="margin-top: 12px;">
            <strong style="font-size: 13px; color: #1f2937; text-transform: uppercase; letter-spacing: 0.04em;">Warnings</strong>
            ${warnings}
          </div>
        </div>
      `;
    })
    .join("\n    ");
}

function buildEmailHtml(result: AnalysisResultData, resultUrl: string) {
  const dependencyCards = renderDependencyCards(result.dependencyScores);
  const riskColor = getRiskColor(result.riskLevel as RiskLevel);

  return `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          @media only screen and (max-width: 600px) {
            .stackiq-wrapper {
              padding: 2px !important;
            }

            .stackiq-container {
              padding: 2px !important;
            }

            .stackiq-shell {
              border-radius: 16px !important;
            }

            .stackiq-stats {
              grid-template-columns: 1fr !important;
            }

            .stackiq-stat,
            .stackiq-summary,
            .stackiq-dependency,
            .stackiq-empty {
              padding: 14px !important;
            }

            .stackiq-dependency-row {
              display: block !important;
            }

            .stackiq-dependency-row > div {
              width: 100% !important;
            }

            .stackiq-button {
              width: 100% !important;
              box-sizing: border-box !important;
            }
          }
        </style>
      </head>
      <body style="margin: 0; padding: 0; background: #fff7ed; font-family: Arial, Helvetica, sans-serif; color: #111827;">
<div class="stackiq-wrapper" style="margin: 0; padding: 0; background: #f3f4f6; font-family: Arial, Helvetica, sans-serif; color: #111827;">
      <div class="stackiq-container" style="max-width: 720px; margin: 0 auto; padding: 32px 20px;">
        <div class="stackiq-shell" style="overflow: hidden; border-radius: 20px; border: 1px solid #d1d5db; background: #ffffff; box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);">
          <div style="padding: 28px 28px 24px; background: #f8fafc; color: #111827; border-bottom: 1px solid #e5e7eb;">
            <div style="font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.85; color: #f59e0b;">StackIQ analysis complete</div>
            <h1 style="margin: 10px 0 8px; font-size: 28px; line-height: 1.2; color: #1f2937;"><span style="color: ${riskColor.text};">${escapeHtml(result.riskLevel)}</span> risk result</h1>
            <p style="margin: 0; font-size: 16px; line-height: 1.6; opacity: 0.9;">Your analysis has finished and the full report is ready to review.</p>
          </div>

          <div style="padding: 28px;">
            <div class="stackiq-stats" style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 24px;">
              <div class="stackiq-stat" style="padding: 16px; border-radius: 14px; background: #f9fafb; border: 1px solid ${riskColor.border};">
                <div style="font-size: 12px; color: ${riskColor.text}; text-transform: uppercase; letter-spacing: 0.08em;">Global score</div>
                <div style="margin-top: 6px; font-size: 28px; font-weight: 700; color: #1f2937;">${result.globalScore}</div>
              </div>
              <div class="stackiq-stat" style="padding: 16px; border-radius: 14px; background: #f9fafb; border: 1px solid ${riskColor.border};">
                <div style="font-size: 12px; color: ${riskColor.text}; text-transform: uppercase; letter-spacing: 0.08em;">Risk level</div>
                <div style="margin-top: 6px; font-size: 22px; font-weight: 700; color: ${riskColor.text};">${escapeHtml(result.riskLevel)}</div>
              </div>
              <div class="stackiq-stat" style="padding: 16px; border-radius: 14px; background: #f9fafb; border: 1px solid ${riskColor.border};">
                <div style="font-size: 12px; color: ${riskColor.text}; text-transform: uppercase; letter-spacing: 0.08em;">Dependencies</div>
                <div style="margin-top: 6px; font-size: 22px; font-weight: 700; color: #1f2937;">${result.dependencyScores?.length ?? 0}</div>
              </div>
            </div>

            <div class="stackiq-summary" style="padding: 18px; border-radius: 16px; background: #ffffff; border: 1px solid ${riskColor.border}; margin-bottom: 24px;">
              <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">Summary</div>
              <div style="font-size: 16px; line-height: 1.7; color: #1f2937;">${escapeHtml(result.summary)}</div>
            </div>

            <div style="text-align: center; margin-bottom: 28px;">
              <a class="stackiq-button" href="${resultUrl}" style="display: inline-block; padding: 13px 22px; border-radius: 12px; background: #ffffff; color: ${riskColor.text}; text-decoration: none; font-weight: 700; border: 1px solid ${riskColor.border};">
                Open result page
              </a>
              <div style="margin-top: 10px; font-size: 12px; color: #6b7280; word-break: break-all;">${resultUrl}</div>
            </div>

            <div>
              <h2 style="margin: 0 0 12px; font-size: 18px; color: #0f172a;">Dependency scores</h2>
              ${dependencyCards}
            </div>
          </div>
        </div>
      </div>
    </div>
      </body>
    </html>
  `;
}

function buildEmailText(result: AnalysisResultData, resultUrl: string) {
  const dependencyLines = result.dependencyScores?.length
    ? result.dependencyScores.map((dependency) => {
        const warnings = dependency.warnings?.length ? dependency.warnings.join("; ") : "No warnings";
        const dependencyTitle = dependency.dependencyName ?? dependency.dependencyId;
        return [
          `- ${dependencyTitle}`,
          `  Score: ${dependency.score}`,
          `  Risk: ${dependency.riskLevel}`,
          `  Warnings: ${warnings}`,
        ].join("\n");
      }).join("\n\n")
    : "No dependency scores were included.";

  return [
    "StackIQ analysis complete",
    `Global score: ${result.globalScore}`,
    `Risk level: ${result.riskLevel}`,
    `Summary: ${result.summary}`,
    `Result page: ${resultUrl}`,
    "",
    "Dependency scores:",
    dependencyLines,
  ].join("\n");
}

export async function sendResultEmail(
  result: AnalysisResultData,
  email: string,
  analysisPageToken: string
): Promise<boolean> {
  const token = process.env.MAILTRAP_API_KEY;

  if (!token) {
    console.warn("[worker] Mailtrap token is not configured, skipping email send.", token);
    return false;
  }

  const mailtrap = new MailtrapClient({ token, sandbox: true, testInboxId: 4789661 });

  try {
    const resultUrl = analysisPageToken.trim()
      ? `https://stackiq.dev/results/${encodeURIComponent(analysisPageToken)}`
      : "https://stackiq.dev/results";

    const sender = {
      email: "stackIq@stackiq.dev",
      name: "STACKIQ",
    };
    const recipients = [{ email }];
    await mailtrap.send({
      from: sender,
      to: recipients,
      subject: `StackIQ analysis result: ${result.riskLevel}`,
      html: buildEmailHtml(result, resultUrl),
      text: buildEmailText(result, resultUrl),
    });

    return true;
  } catch (error) {
    console.error("[worker] Failed to send analysis email:", error);
    return false;
  }
}
