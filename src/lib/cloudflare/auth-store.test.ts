import { describe, expect, it } from "vitest";
import {
  authenticatePassword,
  createOwnerAccount,
  createSession,
  normalizeEmail,
  readSessionContext,
  revokeSession,
  type D1DatabaseLike,
  type D1PreparedStatementLike,
} from "./auth-store";
import { hashPassword } from "./crypto";

class MemoryStatement<T = unknown> implements D1PreparedStatementLike<T> {
  private values: Array<string | number | null> = [];

  constructor(
    private readonly db: MemoryD1,
    private readonly query: string
  ) {}

  bind(...values: Array<string | number | null>): D1PreparedStatementLike<T> {
    this.values = values;
    return this;
  }

  first(): Promise<T | null> {
    return Promise.resolve(this.db.first<T>(this.query, this.values));
  }

  all(): Promise<{ results: T[] }> {
    return Promise.resolve({ results: [] });
  }

  run(): Promise<unknown> {
    this.db.run(this.query, this.values);
    return Promise.resolve({ success: true });
  }
}

class MemoryD1 implements D1DatabaseLike {
  users = new Map<string, Record<string, string | null>>();
  accounts = new Map<string, Record<string, string | null>>();
  profiles = new Map<string, Record<string, string | null>>();
  sessions = new Map<string, Record<string, string | null>>();

  prepare<T = unknown>(query: string): D1PreparedStatementLike<T> {
    return new MemoryStatement<T>(this, query);
  }

  async batch(statements: D1PreparedStatementLike[]): Promise<unknown[]> {
    for (const statement of statements) {
      await statement.run();
    }
    return [];
  }

  first<T>(query: string, values: Array<string | number | null>): T | null {
    if (query.includes("FROM auth_users")) {
      const email = String(values[0]);
      return (
        Array.from(this.users.values()).find((row) => row.email === email) ?? null
      ) as T | null;
    }

    if (query.includes("FROM auth_sessions")) {
      const [tokenHash, now] = values.map(String);
      const session = this.sessions.get(tokenHash);
      if (!session || String(session.expires_at) <= now) return null;
      const user = this.users.get(String(session.user_id));
      if (!user || user.disabled_at) return null;
      const profile = Array.from(this.profiles.values()).find(
        (row) => row.user_id === user.id
      );
      if (!profile) return null;
      const account = this.accounts.get(String(profile.account_id));
      if (!account) return null;
      return {
        user_id: user.id,
        email: user.email,
        profile_id: profile.id,
        account_id: account.id,
        account_name: account.name,
        account_role: profile.account_role,
        default_currency: account.default_currency,
        expires_at: session.expires_at,
      } as T;
    }

    return null;
  }

  run(query: string, values: Array<string | number | null>): void {
    if (query.includes("INSERT INTO auth_users")) {
      const [id, email, password_hash, email_verified_at, created_at, updated_at] =
        values.map((value) => (value === null ? null : String(value)));
      this.users.set(String(id), {
        id,
        email,
        password_hash,
        email_verified_at,
        disabled_at: null,
        created_at,
        updated_at,
      });
      return;
    }

    if (query.includes("INSERT INTO accounts")) {
      const [id, name, owner_user_id, created_at, updated_at] = values.map((value) =>
        value === null ? null : String(value)
      );
      this.accounts.set(String(id), {
        id,
        name,
        owner_user_id,
        default_currency: "USD",
        created_at,
        updated_at,
      });
      return;
    }

    if (query.includes("INSERT INTO profiles")) {
      const [id, user_id, account_id, full_name, email, created_at, updated_at] =
        values.map((value) => (value === null ? null : String(value)));
      this.profiles.set(String(id), {
        id,
        user_id,
        account_id,
        account_role: "owner",
        full_name,
        email,
        created_at,
        updated_at,
      });
      return;
    }

    if (query.includes("INSERT INTO auth_sessions")) {
      const [
        token_hash,
        user_id,
        user_agent,
        ip_hash,
        expires_at,
        created_at,
        last_seen_at,
      ] = values.map((value) => (value === null ? null : String(value)));
      this.sessions.set(String(token_hash), {
        token_hash,
        user_id,
        user_agent,
        ip_hash,
        expires_at,
        created_at,
        last_seen_at,
      });
      return;
    }

    if (query.includes("UPDATE auth_sessions")) {
      const [last_seen_at, token_hash] = values.map(String);
      const session = this.sessions.get(token_hash);
      if (session) session.last_seen_at = last_seen_at;
      return;
    }

    if (query.includes("DELETE FROM auth_sessions")) {
      this.sessions.delete(String(values[0]));
    }
  }
}

describe("Cloudflare auth store", () => {
  it("normalizes email addresses", () => {
    expect(normalizeEmail("  USER@Example.COM ")).toBe("user@example.com");
  });

  it("creates an owner account and authenticates it", async () => {
    const db = new MemoryD1();

    const created = await createOwnerAccount(db, {
      email: " Owner@Example.com ",
      password: "correct horse battery staple",
      fullName: "Owner User",
      accountName: "Acme",
      now: new Date("2026-07-10T12:00:00.000Z"),
    });

    expect(created.userId).toMatch(/^usr_/);
    expect(created.accountId).toMatch(/^acct_/);
    expect(created.profileId).toMatch(/^prof_/);

    await expect(
      authenticatePassword(db, "owner@example.com", "correct horse battery staple")
    ).resolves.toMatchObject({ id: created.userId, email: "owner@example.com" });
    await expect(
      authenticatePassword(db, "owner@example.com", "wrong password")
    ).resolves.toBeNull();
  });

  it("creates, reads, and revokes sessions", async () => {
    const db = new MemoryD1();
    const passwordHash = await hashPassword("correct horse battery staple");
    const now = new Date("2026-07-10T12:00:00.000Z");

    db.users.set("usr_1", {
      id: "usr_1",
      email: "owner@example.com",
      password_hash: passwordHash,
      disabled_at: null,
    });
    db.accounts.set("acct_1", {
      id: "acct_1",
      name: "Acme",
      owner_user_id: "usr_1",
      default_currency: "USD",
    });
    db.profiles.set("prof_1", {
      id: "prof_1",
      user_id: "usr_1",
      account_id: "acct_1",
      account_role: "owner",
    });

    const session = await createSession(db, "usr_1", {
      now,
      ttlDays: 7,
      userAgent: "vitest",
    });

    await expect(readSessionContext(db, session.token, now)).resolves.toMatchObject({
      userId: "usr_1",
      accountId: "acct_1",
      accountRole: "owner",
    });

    await revokeSession(db, session.token);
    await expect(readSessionContext(db, session.token, now)).resolves.toBeNull();
  });
});
