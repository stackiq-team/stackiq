import { describe, expect, it } from "vitest";

type IssueEvidenceInput = {
  dependency: string;
  repositoryFullName: string;
  issues: Array<{
    number: number;
    title: string;
    bodyText: string;
    url: string;
    closed: boolean;
    publishedAt: string;
    labels: string[];
  }>;
};

type DependencyRelationship = {
  sourceDependency: string;
  targetDependency: string;
  relationshipType:
    | "KNOWN_INCOMPATIBILITY"
    | "POSSIBLE_CONFLICT"
    | "COMMON_INTEGRATION"
    | "UNKNOWN";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  summary: string;
  evidence: Array<{
    repositoryFullName: string;
    issueNumber: number;
    issueUrl: string;
    matchedTerms: string[];
    labels: string[];
    closed: boolean;
  }>;
};

const conflictTerms = [
  "incompatible",
  "conflict",
  "breaks",
  "does not work",
  "not compatible",
  "version mismatch",
  "peer dependency",
];

const integrationTerms = [
  "integration",
  "works with",
  "middleware",
  "setup",
  "configuration",
];

function findMatchedTerms(text: string, terms: string[]) {
  const normalized = text.toLowerCase();
  return terms.filter((term) => normalized.includes(term));
}

function analyzeDependencyRelationship(
  source: IssueEvidenceInput,
  targetDependencyName: string
): DependencyRelationship {
  const targetName = targetDependencyName.toLowerCase();

  const evidence = source.issues.flatMap((issue) => {
    const text = `${issue.title}\n${issue.bodyText}\n${issue.labels.join(" ")}`;
    if (!text.toLowerCase().includes(targetName)) return [];

    const matchedConflictTerms = findMatchedTerms(text, conflictTerms);
    const matchedIntegrationTerms = findMatchedTerms(text, integrationTerms);
    const matchedTerms = [...matchedConflictTerms, ...matchedIntegrationTerms];

    if (matchedTerms.length === 0) return [];

    return [
      {
        repositoryFullName: source.repositoryFullName,
        issueNumber: issue.number,
        issueUrl: issue.url,
        matchedTerms,
        labels: issue.labels,
        closed: issue.closed,
      },
    ];
  });

  const conflictEvidence = evidence.filter((item) =>
    item.matchedTerms.some((term) => conflictTerms.includes(term))
  );
  const openConflictEvidence = conflictEvidence.filter((item) => !item.closed);

  if (openConflictEvidence.length > 0 || conflictEvidence.length >= 2) {
    return {
      sourceDependency: source.dependency,
      targetDependency: targetDependencyName,
      relationshipType: "KNOWN_INCOMPATIBILITY",
      confidence: openConflictEvidence.length > 0 ? "HIGH" : "MEDIUM",
      summary: `${source.dependency} has issue evidence mentioning ${targetDependencyName} with conflict language.`,
      evidence,
    };
  }

  if (conflictEvidence.length === 1) {
    return {
      sourceDependency: source.dependency,
      targetDependency: targetDependencyName,
      relationshipType: "POSSIBLE_CONFLICT",
      confidence: "MEDIUM",
      summary: `${source.dependency} has one issue mentioning a possible conflict with ${targetDependencyName}.`,
      evidence,
    };
  }

  if (evidence.length > 0) {
    return {
      sourceDependency: source.dependency,
      targetDependency: targetDependencyName,
      relationshipType: "COMMON_INTEGRATION",
      confidence: "LOW",
      summary: `${source.dependency} and ${targetDependencyName} are mentioned together, but no clear conflict was found.`,
      evidence,
    };
  }

  return {
    sourceDependency: source.dependency,
    targetDependency: targetDependencyName,
    relationshipType: "UNKNOWN",
    confidence: "LOW",
    summary: `No issueMining evidence found for ${source.dependency} with ${targetDependencyName}.`,
    evidence: [],
  };
}

describe("dependency relationship issueMining example", () => {
  it("classifies pair risk from issue titles, bodies, labels, and state", () => {
    const expressIssueEvidence: IssueEvidenceInput = {
      dependency: "express",
      repositoryFullName: "expressjs/express",
      issues: [
        {
          number: 4910,
          title: "cors middleware breaks after express 5 upgrade",
          bodyText:
            "After upgrading to express 5, our cors setup does not work with preflight requests.",
          url: "https://github.com/expressjs/express/issues/4910",
          closed: false,
          publishedAt: "2026-06-10T00:00:00Z",
          labels: ["bug", "compatibility"],
        },
        {
          number: 4821,
          title: "Document cors middleware configuration",
          bodyText: "This is a setup question for using cors middleware with express.",
          url: "https://github.com/expressjs/express/issues/4821",
          closed: true,
          publishedAt: "2026-05-01T00:00:00Z",
          labels: ["docs"],
        },
      ],
    };

    const relationship = analyzeDependencyRelationship(expressIssueEvidence, "cors");

    expect(relationship).toEqual({
      sourceDependency: "express",
      targetDependency: "cors",
      relationshipType: "KNOWN_INCOMPATIBILITY",
      confidence: "HIGH",
      summary: "express has issue evidence mentioning cors with conflict language.",
      evidence: [
        {
          repositoryFullName: "expressjs/express",
          issueNumber: 4910,
          issueUrl: "https://github.com/expressjs/express/issues/4910",
          matchedTerms: ["breaks", "does not work", "middleware", "setup"],
          labels: ["bug", "compatibility"],
          closed: false,
        },
        {
          repositoryFullName: "expressjs/express",
          issueNumber: 4821,
          issueUrl: "https://github.com/expressjs/express/issues/4821",
          matchedTerms: ["middleware", "setup", "configuration"],
          labels: ["docs"],
          closed: true,
        },
      ],
    });
  });
});
