import { NextResponse } from "next/server";

import { resolveAuthPublicOrigin } from "@/lib/auth/public-origin";
import { buildAuthVerifyUrl } from "@/lib/auth/verify-links";
import { getWacrmCloudflareEnv } from "@/lib/cloudflare/env";
import {
  AUTH_EMAIL_DEFAULT_FROM,
  AUTH_EMAIL_FROM_NAME,
  buildPasswordResetEmailHtml,
  buildPasswordResetEmailText,
} from "@/lib/email/auth-emails";
import { createAdminClient } from "@/lib/supabase/admin";

interface ResetPasswordBody {
  email?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | ResetPasswordBody
      | null;
    const validationError = validateResetPasswordBody(body);
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
    const nextPath = "/reset-password?mode=recovery";
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;

    const supabase = createAdminClient();
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: body!.email as string,
      options: { redirectTo },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.info("[auth reset-password] generated recovery link", {
      requestedRedirectTo: redirectTo,
      returnedRedirectTo: data.properties.redirect_to,
      actionLink: describeActionLink(data.properties.action_link),
    });

    const verifyUrl = buildAuthVerifyUrl({
      origin,
      tokenHash: data.properties.hashed_token,
      type: "recovery",
      next: nextPath,
    });

    await env.EMAIL.send({
      to: body!.email as string,
      from: {
        email: env.AUTH_EMAIL_FROM ?? AUTH_EMAIL_DEFAULT_FROM,
        name: AUTH_EMAIL_FROM_NAME,
      },
      subject: "Restablece tu contraseña en WACRM",
      text: buildPasswordResetEmailText(verifyUrl),
      html: buildPasswordResetEmailHtml(verifyUrl),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[auth reset-password] failed:", err);
    return NextResponse.json(
      { error: "No pudimos enviar el correo de restablecimiento." },
      { status: 500 }
    );
  }
}

function validateResetPasswordBody(
  body: ResetPasswordBody | null
): string | null {
  if (!body) return "Invalid JSON body.";
  if (typeof body.email !== "string" || !body.email.includes("@")) {
    return "El correo no es válido.";
  }
  return null;
}

function describeActionLink(actionLink: string) {
  try {
    const url = new URL(actionLink);
    return {
      host: url.host,
      type: url.searchParams.get("type"),
      redirectTo: url.searchParams.get("redirect_to"),
    };
  } catch {
    return { host: null, type: null, redirectTo: null };
  }
}
