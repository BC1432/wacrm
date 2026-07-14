import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type VerifyType = "signup" | "recovery";

interface VerifyBody {
  tokenHash?: unknown;
  type?: unknown;
  next?: unknown;
}

function parseVerifyType(value: unknown): VerifyType | null {
  if (value === "signup" || value === "recovery") return value;
  return null;
}

function safeNextPath(value: unknown, fallback: string): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return fallback;
  }

  return value;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as VerifyBody | null;
  const tokenHash = typeof body?.tokenHash === "string" ? body.tokenHash : "";
  const type = parseVerifyType(body?.type);
  const fallbackNext =
    type === "recovery" ? "/reset-password?mode=recovery" : "/dashboard";
  const next = safeNextPath(body?.next, fallbackNext);

  if (!tokenHash || !type) {
    return NextResponse.json(
      { error: "El enlace no es válido." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    console.warn("[auth verify] token verification failed", {
      type,
      message: error.message,
    });
    return NextResponse.json(
      { error: "El enlace expiró o ya fue utilizado." },
      { status: 400 },
    );
  }

  return NextResponse.json({ redirectTo: next });
}
