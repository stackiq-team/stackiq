import { describe, expect, it } from "vitest";
import { translate } from "../i18n/translations";

describe("translations", () => {
  it("returns French copy with parameter replacement", () => {
    expect(translate("fr", "result.token", { token: "abc123" })).toBe(
      "Jeton de resultat : abc123"
    );
  });
});
