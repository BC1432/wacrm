import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';

const BRIDGES = [
  'whatsapp',
  'telegram',
  'signal',
  'instagram',
  'custom',
] as const;

export async function GET() {
  try {
    const ctx = await requireRole('admin');
    const { data, error } = await ctx.supabase
      .from('matrix_bridge_connections')
      .select(
        'id, bridge, label, management_room_id, status, metadata, updated_at'
      )
      .eq('account_id', ctx.accountId)
      .order('created_at');
    if (error) throw error;
    return NextResponse.json({ bridges: data ?? [] });
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
    const bridge = typeof body?.bridge === 'string' ? body.bridge : '';
    const label = typeof body?.label === 'string' ? body.label.trim() : '';
    if (!(BRIDGES as readonly string[]).includes(bridge) || !label) {
      return NextResponse.json(
        { error: 'A valid bridge and label are required' },
        { status: 400 }
      );
    }
    const config = await ctx.supabase
      .from('matrix_config')
      .select('id')
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (!config.data) {
      return NextResponse.json(
        { error: 'Configure Matrix first' },
        { status: 409 }
      );
    }
    const { data, error } = await ctx.supabase
      .from('matrix_bridge_connections')
      .insert({
        account_id: ctx.accountId,
        config_id: config.data.id,
        bridge,
        label,
        management_room_id:
          typeof body?.management_room_id === 'string'
            ? body.management_room_id.trim() || null
            : null,
        status: 'pending',
      })
      .select('id, bridge, label, management_room_id, status')
      .single();
    if (error) throw error;
    return NextResponse.json({ bridge: data }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
