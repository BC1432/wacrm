import { NextResponse } from "next/server";

import { revokeSession } from "@/lib/cloudflare/auth-store";
import { getWacrmCloudflareEnv, requireD1 } from "@/lib/cloudflare/env";
import {
  clearAuthCookie,
  getAuthCookieName,
  readCookie,
} from "@/lib/cloudflare/session-cookie";

export async function POST(request: Request) {
  try {
    const env = await getWacrmCloudflareEnv();
    const cookieName = getAuthCookieName(env);
    const token = readCookie(request.headers.get("cookie"), cookieName);
    if (token) {
      await revokeSession(requireD1(env), token);
    }

    const response = NextResponse.json({ data: { ok: true } });
    clearAuthCookie(response, { cookieName });
    return response;
  } catch (err) {
    console.error("[cloudflare auth logout] failed:", err);
    return NextResponse.json(
      { error: "Cloudflare logout failed." },
      { status: 500 }
    );
  }
}
