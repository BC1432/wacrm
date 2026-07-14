import { createClient as createMatrixSdkClient, MsgType } from 'matrix-js-sdk';

export interface MatrixCredentials {
  homeserverUrl: string;
  accessToken: string;
  userId: string;
}

export function normalizeHomeserverUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:') {
    throw new Error('Matrix homeserver URL must use HTTPS');
  }
  return url.toString().replace(/\/$/, '');
}

export async function matrixWhoAmI(
  homeserverUrl: string,
  accessToken: string
): Promise<{ user_id: string; device_id?: string }> {
  const response = await fetch(
    `${normalizeHomeserverUrl(homeserverUrl)}/_matrix/client/v3/account/whoami`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Matrix rejected the access token (HTTP ${response.status})`
    );
  }
  return response.json() as Promise<{ user_id: string; device_id?: string }>;
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
