import { NextResponse } from "next/server";

import { createOwnerAccount } from "@/lib/cloudflare/auth-store";
import { getWacrmCloudflareEnv, requireD1 } from "@/lib/cloudflare/env";
import { timingSafeStringEqual } from "@/lib/cloudflare/crypto";

interface BootstrapBody {
  email?: unknown;
  password?: unknown;
  fullName?: unknown;
  accountName?: unknown;
}

export async function POST(request: Request) {
  try {
    const env = await getWacrmCloudflareEnv();
    const expectedSecret =
      env.CLOUDFLARE_BOOTSTRAP_SECRET ??
      process.env.CLOUDFLARE_BOOTSTRAP_SECRET;

    if (!expectedSecret) {
      return NextResponse.json(
        { error: "Cloudflare bootstrap is not configured." },
        { status: 503 }
      );
    }

    const providedSecret = request.headers.get("x-bootstrap-secret") ?? "";
    if (!timingSafeStringEqual(providedSecret, expectedSecret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as BootstrapBody | null;
    const validationError = validateBootstrapBody(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const created = await createOwnerAccount(requireD1(env), {
      email: body!.email as string,
      password: body!.password as string,
      fullName: body!.fullName as string,
      accountName: body!.accountName as string,
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err) {
    console.error("[cloudflare bootstrap] failed:", err);
    return NextResponse.json(
      { error: "Cloudflare bootstrap failed." },
      { status: 500 }
    );
  }
}

function validateBootstrapBody(body: BootstrapBody | null): string | null {
  if (!body) return "Invalid JSON body.";
  if (typeof body.email !== "string" || !body.email.includes("@")) {
    return "'email' must be a valid email string.";
  }
  if (typeof body.password !== "string" || body.password.length < 8) {
    return "'password' must be at least 8 characters.";
  }
  if (typeof body.fullName !== "string" || body.fullName.trim().length === 0) {
    return "'fullName' is required.";
  }
  if (
    typeof body.accountName !== "string" ||
    body.accountName.trim().length === 0
  ) {
    return "'accountName' is required.";
  }
  return null;
}
