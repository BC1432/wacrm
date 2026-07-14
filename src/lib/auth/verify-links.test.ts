import { describe, expect, it } from "vitest";

import { buildAuthVerifyUrl } from "./verify-links";

describe("buildAuthVerifyUrl", () => {
  it("builds first-party recovery verification links", () => {
    const url = new URL(
      buildAuthVerifyUrl({
        origin: "https://crm.evento.do",
        tokenHash: "abc123",
        type: "recovery",
        next: "/reset-password?mode=recovery",
      }),
    );

    expect(url.origin).toBe("https://crm.evento.do");
    expect(url.pathname).toBe("/auth/verify");
    expect(url.searchParams.get("token_hash")).toBe("abc123");
    expect(url.searchParams.get("type")).toBe("recovery");
    expect(url.searchParams.get("next")).toBe("/reset-password?mode=recovery");
  });
});
