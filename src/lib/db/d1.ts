import { getWacrmCloudflareEnv, requireD1 } from "@/lib/cloudflare/env";
import type { D1DatabaseLike } from "@/lib/cloudflare/auth-store";

export async function getD1(): Promise<D1DatabaseLike> {
  const env = await getWacrmCloudflareEnv();
  return requireD1(env);
}
