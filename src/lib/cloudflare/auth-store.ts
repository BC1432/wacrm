import {
  generateId,
  generateOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  verifyPassword,
} from "./crypto";
import { isAccountRole, type AccountRole } from "@/lib/auth/roles";

type D1Value = string | number | null;

export interface D1PreparedStatementLike<T = unknown> {
  bind(...values: D1Value[]): D1PreparedStatementLike<T>;
  first(): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface D1DatabaseLike {
  prepare<T = unknown>(query: string): D1PreparedStatementLike<T>;
  batch(statements: D1PreparedStatementLike[]): Promise<unknown[]>;
}

interface AuthUserRow {
  id: string;
  email: string;
  password_hash: string;
  disabled_at: string | null;
}

interface SessionContextRow {
  user_id: string;
  email: string;
  profile_id: string;
  account_id: string;
  account_name: string;
  account_role: string;
  default_currency: string;
  expires_at: string;
}

export interface CreateOwnerAccountInput {
  email: string;
  password: string;
  fullName: string;
  accountName: string;
  now?: Date;
}

export interface CreatedOwnerAccount {
  userId: string;
  accountId: string;
  profileId: string;
}

export interface CreatedSession {
  token: string;
  expiresAt: Date;
}

export interface SessionContext {
  userId: string;
  email: string;
  profileId: string;
  accountId: string;
  accountName: string;
  accountRole: AccountRole;
  defaultCurrency: string;
  expiresAt: Date;
}

export async function createOwnerAccount(
  db: D1DatabaseLike,
  input: CreateOwnerAccountInput
): Promise<CreatedOwnerAccount> {
  const now = toIso(input.now);
  const email = normalizeEmail(input.email);
  const userId = generateId("usr");
  const accountId = generateId("acct");
  const profileId = generateId("prof");
  const passwordHash = await hashPassword(input.password);

  await db.batch([
    db
      .prepare(
        `INSERT INTO auth_users (id, email, password_hash, email_verified_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(userId, email, passwordHash, now, now, now),
    db
      .prepare(
        `INSERT INTO accounts (id, name, owner_user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(accountId, input.accountName.trim(), userId, now, now),
    db
      .prepare(
        `INSERT INTO profiles (id, user_id, account_id, account_role, full_name, email, created_at, updated_at)
         VALUES (?, ?, ?, 'owner', ?, ?, ?, ?)`
      )
      .bind(profileId, userId, accountId, input.fullName.trim(), email, now, now),
  ]);

  return { userId, accountId, profileId };
}

export async function authenticatePassword(
  db: D1DatabaseLike,
  email: string,
  password: string
): Promise<AuthUserRow | null> {
  const row = await db
    .prepare<AuthUserRow>(
      `SELECT id, email, password_hash, disabled_at
       FROM auth_users
       WHERE email = ?`
    )
    .bind(normalizeEmail(email))
    .first();

  if (!row || row.disabled_at) return null;
  return (await verifyPassword(password, row.password_hash)) ? row : null;
}

export async function createSession(
  db: D1DatabaseLike,
  userId: string,
  options: {
    now?: Date;
    ttlDays?: number;
    userAgent?: string | null;
    ipHash?: string | null;
  } = {}
): Promise<CreatedSession> {
  const now = options.now ?? new Date();
  const ttlDays = options.ttlDays ?? 30;
  const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
  const token = await generateOpaqueToken();

  await db
    .prepare(
      `INSERT INTO auth_sessions
        (token_hash, user_id, user_agent, ip_hash, expires_at, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      token.hash,
      userId,
      options.userAgent ?? null,
      options.ipHash ?? null,
      expiresAt.toISOString(),
      now.toISOString(),
      now.toISOString()
    )
    .run();

  return { token: token.plaintext, expiresAt };
}

export async function readSessionContext(
  db: D1DatabaseLike,
  token: string,
  now: Date = new Date()
): Promise<SessionContext | null> {
  const tokenHash = await hashOpaqueToken(token);
  const row = await db
    .prepare<SessionContextRow>(
      `SELECT
         u.id AS user_id,
         u.email AS email,
         p.id AS profile_id,
         p.account_id AS account_id,
         a.name AS account_name,
         p.account_role AS account_role,
         a.default_currency AS default_currency,
         s.expires_at AS expires_at
       FROM auth_sessions s
       INNER JOIN auth_users u ON u.id = s.user_id
       INNER JOIN profiles p ON p.user_id = u.id
       INNER JOIN accounts a ON a.id = p.account_id
       WHERE s.token_hash = ?
         AND s.expires_at > ?
         AND u.disabled_at IS NULL`
    )
    .bind(tokenHash, now.toISOString())
    .first();

  if (!row || !isAccountRole(row.account_role)) return null;

  await db
    .prepare(`UPDATE auth_sessions SET last_seen_at = ? WHERE token_hash = ?`)
    .bind(now.toISOString(), tokenHash)
    .run();

  return {
    userId: row.user_id,
    email: row.email,
    profileId: row.profile_id,
    accountId: row.account_id,
    accountName: row.account_name,
    accountRole: row.account_role,
    defaultCurrency: row.default_currency,
    expiresAt: new Date(row.expires_at),
  };
}

export async function revokeSession(
  db: D1DatabaseLike,
  token: string
): Promise<void> {
  await db
    .prepare(`DELETE FROM auth_sessions WHERE token_hash = ?`)
    .bind(await hashOpaqueToken(token))
    .run();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toIso(value: Date | undefined): string {
  return (value ?? new Date()).toISOString();
}
