import { createClient as createMatrixSdkClient, MsgType } from 'matrix-js-sdk';

export interface MatrixCredentials {
  homeserverUrl: string;
  accessToken: string;
  userId: string;
}

export function normalizeHomeserverUrl(value: string): string {
  let cleanValue = value.trim();
  if (!/^https?:\/\//i.test(cleanValue)) {
    cleanValue = 'https://' + cleanValue;
  }
  let url: URL;
  try {
    url = new URL(cleanValue);
  } catch {
    throw new Error('Invalid URL format');
  }
  if (url.protocol !== 'https:') {
    throw new Error('Matrix homeserver URL must use HTTPS');
  }
  if (url.hash || url.pathname !== '/' || url.search) {
    throw new Error(
      'Invalid homeserver URL. It must be a base URL (e.g., https://matrix.org) and cannot contain paths, room links, or query parameters.'
    );
  }
  return url.origin;
}

export async function matrixWhoAmI(
  homeserverUrl: string,
  accessToken: string
): Promise<{ user_id: string; device_id?: string }> {
  let response: Response;
  try {
    response = await fetch(
      `${normalizeHomeserverUrl(homeserverUrl)}/_matrix/client/v3/account/whoami`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Matrix rejected request: Could not connect to homeserver. Details: ${msg}`);
  }

  if (response.status >= 300 && response.status < 400) {
    throw new Error(
      `Matrix rejected request: The homeserver URL returned a redirect (HTTP ${response.status}). Verify that the homeserver URL is correct.`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Matrix rejected the access token (HTTP ${response.status})`
    );
  }

  try {
    return await response.json() as { user_id: string; device_id?: string };
  } catch (error) {
    throw new Error(
      `Matrix rejected response: The homeserver did not return valid JSON. Verify that the URL is a Matrix homeserver, not a web client (like Element).`
    );
  }
}

export async function sendMatrixText(
  credentials: MatrixCredentials,
  roomId: string,
  body: string,
  transactionId: string
): Promise<string> {
  const client = createMatrixSdkClient({
    baseUrl: normalizeHomeserverUrl(credentials.homeserverUrl),
    accessToken: credentials.accessToken,
    userId: credentials.userId,
  });
  const result = await client.sendMessage(
    roomId,
    { msgtype: MsgType.Text, body },
    transactionId
  );
  return result.event_id;
}
