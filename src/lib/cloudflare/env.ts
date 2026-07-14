import { getCloudflareContext } from "@opennextjs/cloudflare";

import type { D1DatabaseLike } from "./auth-store";

export interface SendEmailBindingLike {
  send(message: {
    to: string | string[];
    from: string | { email: string; name?: string };
    subject: string;
    text?: string;
    html?: string;
    replyTo?: string;
  }): Promise<unknown>;
}

export interface WacrmCloudflareEnv {
  DB?: D1DatabaseLike;
  EMAIL?: SendEmailBindingLike;
  AUTH_COOKIE_NAME?: string;
  APP_PUBLIC_URL?: string;
  AUTH_EMAIL_FROM?: string;
  CLOUDFLARE_BOOTSTRAP_SECRET?: string;
}

export async function getWacrmCloudflareEnv(): Promise<WacrmCloudflareEnv> {
  const { env } = await getCloudflareContext({ async: true });
  return env as CloudflareEnv & WacrmCloudflareEnv;
}

export function requireD1(env: WacrmCloudflareEnv): D1DatabaseLike {
  if (!env.DB) {
    throw new Error("Cloudflare D1 binding DB is not configured.");
  }
  return env.DB;
}
