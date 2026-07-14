export interface CloudflareAuthUser {
  id: string;
  email: string;
}

export interface CloudflareAuthProfile {
  id: string;
  accountId: string;
  accountRole: "owner" | "admin" | "agent" | "viewer";
}

export interface CloudflareAuthAccount {
  id: string;
  name: string;
  defaultCurrency: string;
}

export interface CloudflareSessionPayload {
  user: CloudflareAuthUser;
  profile?: CloudflareAuthProfile;
  account?: CloudflareAuthAccount;
  expiresAt: string;
}

interface ApiEnvelope<T> {
  data?: T;
  error?: string;
}

export async function cloudflareLogin(
  email: string,
  password: string
): Promise<CloudflareSessionPayload> {
  const envelope = await requestJson<CloudflareSessionPayload>(
    "/api/cloudflare/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }
  );
  return envelope;
}

export async function cloudflareMe(): Promise<CloudflareSessionPayload | null> {
  const response = await fetch("/api/cloudflare/auth/me", {
    method: "GET",
    credentials: "include",
  });
  if (response.status === 401) return null;
  return parseEnvelope<CloudflareSessionPayload>(response);
}

export async function cloudflareLogout(): Promise<void> {
  await requestJson<{ ok: boolean }>("/api/cloudflare/auth/logout", {
    method: "POST",
    credentials: "include",
  });
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...init });
  return parseEnvelope<T>(response);
}

async function parseEnvelope<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok) {
    throw new Error(body?.error ?? `Request failed with status ${response.status}`);
  }
  if (!body || body.data === undefined) {
    throw new Error("Malformed Cloudflare auth response.");
  }
  return body.data;
}
