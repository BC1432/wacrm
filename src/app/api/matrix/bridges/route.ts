import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { generateId } from '@/lib/cloudflare/crypto';

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
    const { results } = await ctx.db
      .prepare<Record<string, unknown>>(
        `SELECT id, bridge, label, management_room_id, status, metadata, updated_at
         FROM matrix_bridge_connections
         WHERE account_id = ?
         ORDER BY created_at`
      )
      .bind(ctx.accountId)
      .all();

    const bridges = (results ?? []).map(row => ({
      ...row,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {},
    }));

    return NextResponse.json({ bridges });
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

    const configRow = await ctx.db
      .prepare<{ id: string }>(
        `SELECT id FROM matrix_config WHERE account_id = ? LIMIT 1`
      )
      .bind(ctx.accountId)
      .first();

    if (!configRow) {
      return NextResponse.json(
        { error: 'Configure Matrix first' },
        { status: 409 }
      );
    }

    const bridgeId = generateId('mbrg');
    const managementRoomId =
      typeof body?.management_room_id === 'string'
        ? body.management_room_id.trim() || null
        : null;

    await ctx.db
      .prepare(
        `INSERT INTO matrix_bridge_connections (id, account_id, config_id, bridge, label, management_room_id, status)
         VALUES (?, ?, ?, ?, ?, ?, 'pending')`
      )
      .bind(
        bridgeId,
        ctx.accountId,
        configRow.id,
        bridge,
        label,
        managementRoomId
      )
      .run();

    return NextResponse.json(
      {
        bridge: {
          id: bridgeId,
          bridge,
          label,
          management_room_id: managementRoomId,
          status: 'pending',
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
