import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { matrixWhoAmI, normalizeHomeserverUrl } from '@/lib/matrix/client';
import { encrypt } from '@/lib/whatsapp/encryption';
import { isDeliverableUrl } from '@/lib/webhooks/ssrf';
import { generateId } from '@/lib/cloudflare/crypto';

export async function GET() {
  try {
    const ctx = await requireRole('admin');
    const row = await ctx.db
      .prepare<Record<string, unknown>>(
        `SELECT homeserver_url, bot_user_id, enabled, last_sync_at, last_error, updated_at
         FROM matrix_config
         WHERE account_id = ?
         LIMIT 1`
      )
      .bind(ctx.accountId)
      .first();

    if (!row) {
      return NextResponse.json({ configured: false, config: null });
    }

    const config = {
      ...row,
      enabled: row.enabled === 1 || row.enabled === true,
    };

    return NextResponse.json({ configured: true, config });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const homeserverInput =
      typeof body?.homeserver_url === 'string' ? body.homeserver_url : '';
    const accessToken =
      typeof body?.access_token === 'string' ? body.access_token.trim() : '';
    if (!homeserverInput || !accessToken) {
      return NextResponse.json(
        { error: 'homeserver_url and access_token are required' },
        { status: 400 }
      );
    }

    let homeserverUrl: string;
    try {
      homeserverUrl = normalizeHomeserverUrl(homeserverInput);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : 'Invalid homeserver URL',
        },
        { status: 400 }
      );
    }
    if (
      process.env.MATRIX_ALLOW_PRIVATE_HOMESERVER !== 'true' &&
      !(await isDeliverableUrl(homeserverUrl))
    ) {
      return NextResponse.json(
        {
          error:
            'Homeserver must resolve to a public address. Set MATRIX_ALLOW_PRIVATE_HOMESERVER=true only for a trusted private deployment.',
        },
        { status: 400 }
      );
    }

    const identity = await matrixWhoAmI(homeserverUrl, accessToken);
    const requestedUserId =
      typeof body?.bot_user_id === 'string' ? body.bot_user_id.trim() : '';
    if (requestedUserId && requestedUserId !== identity.user_id) {
      return NextResponse.json(
        {
          error: `Token belongs to ${identity.user_id}, not ${requestedUserId}`,
        },
        { status: 400 }
      );
    }

    const configId = generateId('mcfg');
    const enabledVal = body?.enabled !== false ? 1 : 0;
    const updatedAt = new Date().toISOString();
    const encryptedToken = encrypt(accessToken);

    await ctx.db
      .prepare(
        `INSERT INTO matrix_config (id, account_id, created_by_user_id, homeserver_url, bot_user_id, access_token, enabled, sync_token, last_error, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)
         ON CONFLICT(account_id) DO UPDATE SET
           created_by_user_id = excluded.created_by_user_id,
           homeserver_url = excluded.homeserver_url,
           bot_user_id = excluded.bot_user_id,
           access_token = excluded.access_token,
           enabled = excluded.enabled,
           sync_token = NULL,
           last_error = NULL,
           updated_at = excluded.updated_at`
      )
      .bind(
        configId,
        ctx.accountId,
        ctx.userId,
        homeserverUrl,
        identity.user_id,
        encryptedToken,
        enabledVal,
        updatedAt
      )
      .run();

    return NextResponse.json({ success: true, bot_user_id: identity.user_id });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as any).message)
        : String(error);

    if (errorMessage.startsWith('Matrix rejected')) {
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }
    if (
      errorMessage.includes('Invalid key length') ||
      errorMessage.includes('first argument must be of type string')
    ) {
      return NextResponse.json(
        {
          error:
            'Failed to encrypt access token. Verify that ENCRYPTION_KEY is configured as a valid 64-character hex string in your Cloudflare environment variables.',
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: `Server error: ${errorMessage}` },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const ctx = await requireRole('admin');
    await ctx.db
      .prepare(`DELETE FROM matrix_config WHERE account_id = ?`)
      .bind(ctx.accountId)
      .run();
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
