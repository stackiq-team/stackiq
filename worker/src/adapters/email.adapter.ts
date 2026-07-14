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

  const mailtrap = new MailtrapClient({ token, sandbox: true,  testInboxId: 4785403,});

  try {
    const sender = {
      email: "stackIq@stackiq.dev",
      name: "STACKIQ",
    };
    const recipients = [{email: email}];
    await mailtrap.send({
      from: sender,
      to: recipients,
      subject: `StackIQ analysis result: ${result.riskLevel}`,
      text: `Global score: ${result.globalScore}\nRisk level: ${result.riskLevel}\nSummary: ${result.summary} Link:`,
    });

    return true;
  } catch (error) {
    console.error("[worker] Failed to send analysis email:", error);
    return false;
  }
}
