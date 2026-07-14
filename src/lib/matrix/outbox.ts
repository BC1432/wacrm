import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { decrypt } from '@/lib/whatsapp/encryption';
import { sendMatrixText } from '@/lib/matrix/client';
import { retryDelaySeconds } from '@/lib/matrix/retry';

interface OutboxRow {
  id: string;
  account_id: string;
  conversation_id: string;
  message_id: string;
  room_id: string;
  content: { msgtype?: string; body?: string };
  attempts: number;
  max_attempts: number;
}

async function failDelivery(
  admin: SupabaseClient,
  row: OutboxRow,
  error: unknown
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const exhausted = row.attempts >= row.max_attempts;
  const nextAttemptAt = new Date(
    Date.now() + retryDelaySeconds(row.attempts) * 1000
  ).toISOString();

  await admin
    .from('matrix_message_outbox')
    .update({
      status: exhausted ? 'failed' : 'retry',
      last_error: message.slice(0, 1000),
      next_attempt_at: nextAttemptAt,
      locked_at: null,
    })
    .eq('id', row.id);

  await admin
    .from('messages')
    .update({ status: exhausted ? 'failed' : 'sending' })
    .eq('id', row.message_id);
}

export async function processMatrixOutbox(batchSize = 20): Promise<{
  claimed: number;
  sent: number;
  failed: number;
}> {
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc('claim_matrix_outbox', {
    batch_size: batchSize,
  });
  if (error) throw new Error(`Could not claim Matrix outbox: ${error.message}`);

  const rows = (data ?? []) as OutboxRow[];
  let sent = 0;
  let failed = 0;
  const configCache = new Map<string, Record<string, unknown> | null>();

  for (const row of rows) {
    try {
      let config = configCache.get(row.account_id);
      if (config === undefined) {
        const result = await admin
          .from('matrix_config')
          .select('homeserver_url, bot_user_id, access_token, enabled')
          .eq('account_id', row.account_id)
          .maybeSingle();
        if (result.error) throw result.error;
        config = result.data as Record<string, unknown> | null;
        configCache.set(row.account_id, config);
      }
      if (!config || config.enabled !== true) {
        throw new Error(
          'Matrix is not configured or is disabled for this workspace'
        );
      }
      if (row.content.msgtype !== 'm.text' || !row.content.body) {
        throw new Error('Unsupported Matrix outbox content');
      }

      const eventId = await sendMatrixText(
        {
          homeserverUrl: String(config.homeserver_url),
          userId: String(config.bot_user_id),
          accessToken: decrypt(String(config.access_token)),
        },
        row.room_id,
        row.content.body,
        row.message_id
      );

      await admin
        .from('matrix_message_outbox')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          locked_at: null,
          last_error: null,
        })
        .eq('id', row.id);
      await admin
        .from('messages')
        .update({ status: 'sent', external_event_id: eventId })
        .eq('id', row.message_id);
      sent++;
    } catch (error) {
      console.error('[matrix-outbox] delivery failed:', error);
      await failDelivery(admin, row, error);
      failed++;
    }
  }

  return { claimed: rows.length, sent, failed };
}
