import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { matrixWhoAmI, normalizeHomeserverUrl } from '@/lib/matrix/client';
import { encrypt } from '@/lib/whatsapp/encryption';
import { isDeliverableUrl } from '@/lib/webhooks/ssrf';

export async function GET() {
  try {
    const ctx = await requireRole('admin');
    const { data, error } = await ctx.supabase
      .from('matrix_config')
      .select(
        'homeserver_url, bot_user_id, enabled, last_sync_at, last_error, updated_at'
      )
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ configured: !!data, config: data });
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

    const { error } = await ctx.supabase.from('matrix_config').upsert(
      {
        account_id: ctx.accountId,
        created_by_user_id: ctx.userId,
        homeserver_url: homeserverUrl,
        bot_user_id: identity.user_id,
        access_token: encrypt(accessToken),
        enabled: body?.enabled !== false,
        sync_token: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id' }
    );
    if (error) throw error;
    return NextResponse.json({ success: true, bot_user_id: identity.user_id });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Matrix rejected')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return toErrorResponse(error);
  }
}

export async function DELETE() {
  try {
    const ctx = await requireRole('admin');
    const { error } = await ctx.supabase
      .from('matrix_config')
      .delete()
      .eq('account_id', ctx.accountId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
