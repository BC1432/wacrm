import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('admin');
    const { id } = await context.params;
    const { error } = await ctx.supabase
      .from('matrix_bridge_connections')
      .delete()
      .eq('id', id)
      .eq('account_id', ctx.accountId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
