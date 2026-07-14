const PRODUCTION_ORIGIN = "https://crm.evento.do";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function resolveAuthPublicOrigin(
  request: Request,
  configuredUrl?: string,
): string {
  const candidates = [
    configuredUrl,
    process.env.NEXT_PUBLIC_SITE_URL,
    request.headers.get("x-forwarded-host")
      ? `${request.headers.get("x-forwarded-proto") ?? "https"}://${request.headers
          .get("x-forwarded-host")
          ?.split(",")[0]
          ?.trim()}`
      : undefined,
    request.headers.get("host")
      ? `${new URL(request.url).protocol}//${request.headers.get("host")?.trim()}`
      : undefined,
    new URL(request.url).origin,
  ];

  for (const candidate of candidates) {
    const origin = normalizePublicOrigin(candidate);
    if (origin) return origin;
  }

  return PRODUCTION_ORIGIN;
}

function normalizePublicOrigin(candidate: string | undefined): string | null {
  const trimmed = candidate?.trim().replace(/\/+$/, "");
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.toLowerCase();
    if (LOCAL_HOSTS.has(hostname) || hostname.endsWith(".example.com")) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}
