import { describe, expect, it } from "vitest";
import {
  generateId,
  generateOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  parsePasswordHash,
  timingSafeStringEqual,
  verifyPassword,
} from "./crypto";

describe("Cloudflare auth crypto", () => {
  it("hashes and verifies passwords", async () => {
    const stored = await hashPassword("correct horse battery staple");

    expect(parsePasswordHash(stored)).toMatchObject({
      algorithm: "pbkdf2_sha256",
      iterations: 210000,
    });
    await expect(verifyPassword("correct horse battery staple", stored)).resolves.toBe(
      true
    );
    await expect(verifyPassword("wrong password", stored)).resolves.toBe(false);
  });

  it("rejects short passwords", async () => {
    await expect(hashPassword("short")).rejects.toThrow(
      "Password must be at least 8 characters."
    );
  });

  it("generates opaque tokens and hashes them deterministically", async () => {
    const token = await generateOpaqueToken();

    expect(token.plaintext).toHaveLength(43);
    await expect(hashOpaqueToken(token.plaintext)).resolves.toBe(token.hash);
    expect(token.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("compares strings without leaking unequal length through exceptions", () => {
    expect(timingSafeStringEqual("abc", "abc")).toBe(true);
    expect(timingSafeStringEqual("abc", "abd")).toBe(false);
    expect(timingSafeStringEqual("abc", "abcd")).toBe(false);
  });

  it("generates prefixed ids", () => {
    expect(generateId("usr")).toMatch(/^usr_[0-9a-f-]{36}$/);
  });
});
