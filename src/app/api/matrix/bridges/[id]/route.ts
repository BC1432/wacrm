import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('admin');
    const { id } = await context.params;
    await ctx.db
      .prepare(`DELETE FROM matrix_bridge_connections WHERE id = ? AND account_id = ?`)
      .bind(id, ctx.accountId)
      .run();
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
