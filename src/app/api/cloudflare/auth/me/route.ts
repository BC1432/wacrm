import { NextResponse } from "next/server";

import { readSessionContext } from "@/lib/cloudflare/auth-store";
import { getWacrmCloudflareEnv, requireD1 } from "@/lib/cloudflare/env";
import { getAuthCookieName, readCookie } from "@/lib/cloudflare/session-cookie";

export async function GET(request: Request) {
  try {
    const env = await getWacrmCloudflareEnv();
    const token = readCookie(
      request.headers.get("cookie"),
      getAuthCookieName(env)
    );
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = await readSessionContext(requireD1(env), token);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      data: {
        user: { id: session.userId, email: session.email },
        profile: {
          id: session.profileId,
          accountId: session.accountId,
          accountRole: session.accountRole,
        },
        account: {
          id: session.accountId,
          name: session.accountName,
          defaultCurrency: session.defaultCurrency,
        },
        expiresAt: session.expiresAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("[cloudflare auth me] failed:", err);
    return NextResponse.json(
      { error: "Failed to read Cloudflare session." },
      { status: 500 }
    );
  }
}
