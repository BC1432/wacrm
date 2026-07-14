export type AuthVerifyType = "signup" | "recovery";

export function buildAuthVerifyUrl({
  origin,
  tokenHash,
  type,
  next,
}: {
  origin: string;
  tokenHash: string;
  type: AuthVerifyType;
  next: string;
}): string {
  const url = new URL("/auth/verify", origin);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  url.searchParams.set("next", next);
  return url.toString();
}
