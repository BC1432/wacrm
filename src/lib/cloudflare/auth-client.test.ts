import { afterEach, describe, expect, it, vi } from "vitest";

import { cloudflareLogin, cloudflareLogout, cloudflareMe } from "./auth-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Cloudflare auth browser client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs in through the Cloudflare auth API", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            user: { id: "usr_1", email: "owner@example.com" },
            expiresAt: "2026-08-10T00:00:00.000Z",
          },
        })
      );

    await expect(
      cloudflareLogin("owner@example.com", "password123")
    ).resolves.toMatchObject({
      user: { id: "usr_1", email: "owner@example.com" },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cloudflare/auth/login",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          email: "owner@example.com",
          password: "password123",
        }),
      })
    );
  });

  it("returns null for an unauthenticated current session", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({ error: "Unauthorized" }, 401)
    );

    await expect(cloudflareMe()).resolves.toBeNull();
  });

  it("throws API error messages", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({ error: "Invalid email or password." }, 401)
    );

    await expect(cloudflareLogin("a@b.com", "wrong")).rejects.toThrow(
      "Invalid email or password."
    );
  });

  it("logs out through the Cloudflare auth API", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ data: { ok: true } }));

    await expect(cloudflareLogout()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cloudflare/auth/logout",
      expect.objectContaining({ method: "POST", credentials: "include" })
    );
  });
});
