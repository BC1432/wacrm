import { describe, expect, it } from "vitest";

import { resolveAuthPublicOrigin } from "./public-origin";

describe("resolveAuthPublicOrigin", () => {
  it("uses the configured production URL first", () => {
    const request = new Request("http://localhost:3000/api/auth/reset-password");

    expect(resolveAuthPublicOrigin(request, "https://crm.evento.do/")).toBe(
      "https://crm.evento.do",
    );
  });

  it("does not publish localhost links in auth emails", () => {
    const request = new Request("http://localhost:3000/api/auth/reset-password", {
      headers: { host: "localhost:3000" },
    });

    expect(resolveAuthPublicOrigin(request)).toBe("https://crm.evento.do");
  });

  it("uses forwarded production host when no explicit URL is configured", () => {
    const request = new Request("http://internal/api/auth/signup", {
      headers: {
        "x-forwarded-host": "crm.evento.do",
        "x-forwarded-proto": "https",
      },
    });

    expect(resolveAuthPublicOrigin(request)).toBe("https://crm.evento.do");
  });

  it("ignores example domains from local sample env files", () => {
    const request = new Request("http://localhost:3000/api/auth/signup");

    expect(resolveAuthPublicOrigin(request, "https://crm.example.com")).toBe(
      "https://crm.evento.do",
    );
  });
});
