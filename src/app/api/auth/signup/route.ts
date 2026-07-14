import { NextResponse } from "next/server";

import { resolveAuthPublicOrigin } from "@/lib/auth/public-origin";
import { buildAuthVerifyUrl } from "@/lib/auth/verify-links";
import { getWacrmCloudflareEnv } from "@/lib/cloudflare/env";
import {
  AUTH_EMAIL_DEFAULT_FROM,
  AUTH_EMAIL_FROM_NAME,
  buildSignupEmailHtml,
  buildSignupEmailText,
} from "@/lib/email/auth-emails";
import { createAdminClient } from "@/lib/supabase/admin";

interface SignupBody {
  email?: unknown;
  password?: unknown;
  fullName?: unknown;
  inviteToken?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as SignupBody | null;
    const validationError = validateSignupBody(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const env = await getWacrmCloudflareEnv();
    if (!env.EMAIL) {
      return NextResponse.json(
        { error: "Cloudflare Email Sending is not configured." },
        { status: 503 }
      );
    }

    const origin = resolveAuthPublicOrigin(request, env.APP_PUBLIC_URL);
    const inviteToken =
      typeof body!.inviteToken === "string" && body!.inviteToken.trim()
        ? body!.inviteToken.trim()
        : null;
    const nextPath = inviteToken
      ? `/join/${encodeURIComponent(inviteToken)}`
      : "/dashboard";
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(
      nextPath
    )}`;

    const supabase = createAdminClient();
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "signup",
      email: body!.email as string,
      password: body!.password as string,
      options: {
        data: { full_name: body!.fullName as string },
        redirectTo,
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const verifyUrl = buildAuthVerifyUrl({
      origin,
      tokenHash: data.properties.hashed_token,
      type: "signup",
      next: nextPath,
    });

    await env.EMAIL.send({
      to: body!.email as string,
      from: {
        email: env.AUTH_EMAIL_FROM ?? AUTH_EMAIL_DEFAULT_FROM,
        name: AUTH_EMAIL_FROM_NAME,
      },
      subject: "Confirma tu cuenta en WACRM",
      text: buildSignupEmailText(verifyUrl),
      html: buildSignupEmailHtml(verifyUrl),
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("[auth signup] failed:", err);
    return NextResponse.json(
      { error: "No pudimos enviar el correo de confirmación." },
      { status: 500 }
    );
  }
}

function validateSignupBody(body: SignupBody | null): string | null {
  if (!body) return "Invalid JSON body.";
  if (typeof body.fullName !== "string" || body.fullName.trim().length === 0) {
    return "El nombre es requerido.";
  }
  if (typeof body.email !== "string" || !body.email.includes("@")) {
    return "El correo no es válido.";
  }
  if (typeof body.password !== "string" || body.password.length < 6) {
    return "La contraseña debe tener al menos 6 caracteres.";
  }
  if (
    body.inviteToken !== undefined &&
    body.inviteToken !== null &&
    typeof body.inviteToken !== "string"
  ) {
    return "La invitación no es válida.";
  }
  return null;
}
