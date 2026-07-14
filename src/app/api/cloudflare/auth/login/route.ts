import { NextResponse } from "next/server";

import {
  authenticatePassword,
  createSession,
} from "@/lib/cloudflare/auth-store";
import { getWacrmCloudflareEnv, requireD1 } from "@/lib/cloudflare/env";
import { getAuthCookieName, setAuthCookie } from "@/lib/cloudflare/session-cookie";

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as LoginBody | null;
    if (typeof body?.email !== "string" || typeof body.password !== "string") {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    const env = await getWacrmCloudflareEnv();
    const db = requireD1(env);
    const user = await authenticatePassword(db, body.email, body.password);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const session = await createSession(db, user.id, {
      userAgent: request.headers.get("user-agent"),
    });

    const response = NextResponse.json({
      data: {
        user: { id: user.id, email: user.email },
        expiresAt: session.expiresAt.toISOString(),
      },
    });
    setAuthCookie(response, session.token, {
      cookieName: getAuthCookieName(env),
      expiresAt: session.expiresAt,
    });
    return response;
  } catch (err) {
    console.error("[cloudflare auth login] failed:", err);
    return NextResponse.json(
      { error: "Cloudflare login failed." },
      { status: 500 }
    );
  }
}
