import { NextResponse } from 'next/server';

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { normalizeHomeserverUrl } from '@/lib/matrix/client';
import { decrypt } from '@/lib/whatsapp/encryption';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount();
    const mxc = new URL(request.url).searchParams.get('uri') ?? '';
    const match = /^mxc:\/\/([^/]+)\/(.+)$/.exec(mxc);
    if (!match) {
      return NextResponse.json(
        { error: 'Invalid Matrix media URI' },
        { status: 400 }
      );
    }
    const { data: config } = await supabaseAdmin()
      .from('matrix_config')
      .select('homeserver_url, access_token')
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (!config)
      return NextResponse.json(
        { error: 'Matrix is not configured' },
        { status: 404 }
      );

    const mediaUrl = `${normalizeHomeserverUrl(config.homeserver_url)}/_matrix/client/v1/media/download/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}`;
    const response = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${decrypt(config.access_token)}` },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok || !response.body) {
      return NextResponse.json(
        { error: 'Matrix media is unavailable' },
        { status: response.status }
      );
    }
    return new Response(response.body, {
      headers: {
        'content-type':
          response.headers.get('content-type') ?? 'application/octet-stream',
        'cache-control': 'private, max-age=300',
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
