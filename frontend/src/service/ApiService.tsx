// services/analyseService.ts

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000"

export interface AnalysisResult {
  globalScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  summary: string;
  dependencyScores: Array<{
    score: number;
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
    dependency: {
      name: string;
      versionRequirement: string;
      type: "DEPENDENCY" | "DEV_DEPENDENCY";
    };
  }>;
}

export interface AnalysisSubmissionResponse {
  message: string;
  analysis: {
    resultToken: string;
  };
  result: AnalysisResult;
}

export interface AnalyseResponse {
  success: boolean;
  message?: string;
  data?: AnalysisSubmissionResponse;
}

export async function sendJsonForAnalysis(
  email: string,
  file: File
): Promise<AnalyseResponse> {
  try {
    const formData = new FormData();

    formData.append("email", email);
    formData.append("file", file);

    const response = await fetch(
      `${API_BASE_URL}/analyses`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const data = await response.json();

    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unknown error occurred",
    };
  }
}
