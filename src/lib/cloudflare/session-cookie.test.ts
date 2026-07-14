import { describe, expect, it } from "vitest";

import { DEFAULT_AUTH_COOKIE_NAME, getAuthCookieName, readCookie } from "./session-cookie";

describe("Cloudflare session cookies", () => {
  it("uses the default cookie name", () => {
    expect(getAuthCookieName()).toBe(DEFAULT_AUTH_COOKIE_NAME);
  });

  it("prefers the configured env cookie name", () => {
    expect(getAuthCookieName({ AUTH_COOKIE_NAME: "custom_session" })).toBe(
      "custom_session"
    );
  });

  it("reads a cookie from a Cookie header", () => {
    expect(readCookie("a=1; wacrm_session=abc%20123; theme=dark", "wacrm_session")).toBe(
      "abc 123"
    );
  });

  it("returns null for missing cookies", () => {
    expect(readCookie("a=1; theme=dark", "wacrm_session")).toBeNull();
    expect(readCookie(null, "wacrm_session")).toBeNull();
  });
});
