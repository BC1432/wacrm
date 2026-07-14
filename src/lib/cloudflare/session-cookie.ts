import type { NextResponse } from "next/server";

import type { WacrmCloudflareEnv } from "./env";

export const DEFAULT_AUTH_COOKIE_NAME = "wacrm_session";

export interface AuthCookieOptions {
  cookieName?: string;
  secure?: boolean;
  expiresAt?: Date;
}

export function getAuthCookieName(env?: WacrmCloudflareEnv): string {
  return (
    env?.AUTH_COOKIE_NAME ??
    process.env.AUTH_COOKIE_NAME ??
    DEFAULT_AUTH_COOKIE_NAME
  );
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  const prefix = `${name}=`;
  const pair = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!pair) return null;
  return decodeURIComponent(pair.slice(prefix.length));
}

export function setAuthCookie(
  response: NextResponse,
  token: string,
  options: AuthCookieOptions = {}
): void {
  response.cookies.set(options.cookieName ?? DEFAULT_AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: options.secure ?? process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: options.expiresAt,
  });
}

export function clearAuthCookie(
  response: NextResponse,
  options: AuthCookieOptions = {}
): void {
  response.cookies.set(options.cookieName ?? DEFAULT_AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: options.secure ?? process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
