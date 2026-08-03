import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RiskLevel } from "../dependencyScore.js";

let sendMailMock = vi.fn().mockResolvedValue({});
let createTransportMock = vi.fn().mockReturnValue({ sendMail: sendMailMock });

vi.mock("nodemailer", () => ({
  default: {
    createTransport: (...args: unknown[]) => createTransportMock(...args),
  },
}));

import { sendResultEmail } from "../adapters/email.adapter.js";

describe("email adapter", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MAILER_USER = "sender@example.com";
    process.env.GMAIL_APP_PASSWORD = "app-password-123";
    delete process.env.MAILER_FROM;
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("creates a Nodemailer transport and sends the email", async () => {
    const result = {
      globalScore: 70,
      riskLevel: "MEDIUM" as RiskLevel,
      summary: "Analysis completed successfully.",
      dependencyScores: [
        {
          dependencyId: "dep-1",
          score: 50,
          riskLevel: "MEDIUM" as RiskLevel,
        },
      ],
    };

    const sent = await sendResultEmail(result, "recipient@example.com", "token-123");

    expect(sent).toBe(true);
    expect(createTransportMock).toHaveBeenCalledWith({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: "sender@example.com",
        pass: "app-password-123",
      },
    });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"STACKIQ" <sender@example.com>',
        to: ["recipient@example.com"],
        subject: "StackIQ analysis result: MEDIUM",
        html: expect.stringContaining("StackIQ analysis complete"),
        text: expect.stringContaining("Global score: 70"),
        attachments: [],
      })
    );
  });

  it("uses the configured public app url for result links", async () => {
    process.env.APP_PUBLIC_URL = "https://example.com/app/";

    const result = {
      globalScore: 70,
      riskLevel: "LOW" as RiskLevel,
      summary: "Analysis completed successfully.",
    };

    await sendResultEmail(result, "recipient@example.com", "token-123");

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('href="https://example.com/app/results/token-123"'),
        text: expect.stringContaining("Result page: https://example.com/app/results/token-123"),
      })
    );
  });

  it("returns false when sending the email fails", async () => {
    createTransportMock.mockReturnValueOnce({
      sendMail: vi.fn().mockRejectedValue(new Error("SMTP failure")),
    });

    const result = {
      globalScore: 70,
      riskLevel: "MEDIUM" as RiskLevel,
      summary: "Analysis completed successfully.",
    };

    const sent = await sendResultEmail(result, "recipient@example.com", "token-123");

    expect(sent).toBe(false);
  });

  it("returns false when mailer credentials are not configured", async () => {
    delete process.env.MAILER_USER;
    delete process.env.GMAIL_APP_PASSWORD;

    const result = {
      globalScore: 70,
      riskLevel: "MEDIUM" as RiskLevel,
      summary: "Analysis completed successfully.",
    };

    const sent = await sendResultEmail(result, "recipient@example.com", "token-123");

    expect(sent).toBe(false);
    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});
