import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { processMatrixOutbox } from '@/lib/matrix/outbox';

export class MatrixSendError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'MatrixSendError';
  }
}

export async function queueMatrixTextMessage(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  conversationId: string,
  text: string
): Promise<{ messageId: string; status: string }> {
  if (!text.trim()) throw new MatrixSendError('content_text is required', 400);

  const { data: conversation, error: conversationError } = await db
    .from('conversations')
    .select('id, transport, external_room_id')
    .eq('id', conversationId)
    .eq('account_id', accountId)
    .maybeSingle();
  if (conversationError || !conversation) {
    throw new MatrixSendError('Conversation not found', 404);
  }
  if (conversation.transport !== 'matrix') {
    throw new MatrixSendError('Conversation is not routed through Matrix', 400);
  }
  if (!conversation.external_room_id) {
    throw new MatrixSendError('Conversation has no Matrix room mapping', 409);
  }

  const { data: message, error: messageError } = await db
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      sender_type: 'agent',
      sender_id: userId,
      content_type: 'text',
      content_text: text.trim(),
      status: 'sending',
    })
    .select('id')
    .single();
  if (messageError || !message) {
    throw new MatrixSendError('Could not persist the outgoing message', 500);
  }

  const admin = supabaseAdmin();
  const { error: queueError } = await admin
    .from('matrix_message_outbox')
    .insert({
      account_id: accountId,
      conversation_id: conversation.id,
      message_id: message.id,
      room_id: conversation.external_room_id,
      content: { msgtype: 'm.text', body: text.trim() },
    });
  if (queueError) {
    await admin
      .from('messages')
      .update({ status: 'failed' })
      .eq('id', message.id);
    throw new MatrixSendError('Could not queue the Matrix message', 500);
  }

  await db
    .from('conversations')
    .update({
      last_message_text: text.trim(),
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id);

  // Best-effort immediate delivery. The persistent cron retries if Matrix is
  // unavailable or this request ends before delivery completes.
  try {
    await processMatrixOutbox(10);
  } catch (error) {
    console.error('[matrix-send] immediate outbox drain failed:', error);
  }

  const { data: persisted } = await admin
    .from('messages')
    .select('status')
    .eq('id', message.id)
    .single();
  return { messageId: message.id, status: persisted?.status ?? 'sending' };
}
