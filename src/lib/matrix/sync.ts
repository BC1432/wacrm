import { createHash } from 'node:crypto';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { decrypt } from '@/lib/whatsapp/encryption';
import { normalizeHomeserverUrl } from '@/lib/matrix/client';
import {
  detectBridgeChannel,
  normalizeMatrixMessage,
  type MatrixRoomSync,
} from '@/lib/matrix/events';
import type { MessagingChannel } from '@/types';

interface MatrixConfigRow {
  id: string;
  account_id: string;
  created_by_user_id: string | null;
  homeserver_url: string;
  bot_user_id: string;
  access_token: string;
  sync_token: string | null;
}

interface MatrixSyncResponse {
  next_batch: string;
  rooms?: { join?: Record<string, MatrixRoomSync> };
}

function syntheticContactPhone(sender: string): string {
  return `matrix-${createHash('sha256').update(sender).digest('hex').slice(0, 24)}`;
}

async function resolveConversation(
  config: MatrixConfigRow,
  roomId: string,
  sender: string,
  channel: MessagingChannel
): Promise<string> {
  const admin = supabaseAdmin();
  const existingRoom = await admin
    .from('conversations')
    .select('id')
    .eq('account_id', config.account_id)
    .eq('external_room_id', roomId)
    .maybeSingle();
  if (existingRoom.data) return existingRoom.data.id;

  const existingParticipant = await admin
    .from('conversations')
    .select('contact_id')
    .eq('account_id', config.account_id)
    .eq('channel', channel)
    .eq('external_participant_id', sender)
    .limit(1)
    .maybeSingle();

  let contactId = existingParticipant.data?.contact_id as string | undefined;
  if (!contactId) {
    const ownerId = config.created_by_user_id;
    if (!ownerId) throw new Error('Matrix config has no creating user');
    const phone = syntheticContactPhone(sender);
    const existingContact = await admin
      .from('contacts')
      .select('id')
      .eq('account_id', config.account_id)
      .eq('phone', phone)
      .maybeSingle();
    if (existingContact.data) {
      contactId = existingContact.data.id;
    } else {
      const createdContact = await admin
        .from('contacts')
        .insert({
          account_id: config.account_id,
          user_id: ownerId,
          phone,
          name: sender,
        })
        .select('id')
        .single();
      if (createdContact.error || !createdContact.data) {
        throw new Error(
          `Could not create Matrix contact: ${createdContact.error?.message}`
        );
      }
      contactId = createdContact.data.id;
    }
  }

  const created = await admin
    .from('conversations')
    .insert({
      account_id: config.account_id,
      user_id: config.created_by_user_id,
      contact_id: contactId,
      channel,
      transport: 'matrix',
      external_room_id: roomId,
      external_participant_id: sender,
    })
    .select('id')
    .single();
  if (!created.error && created.data) return created.data.id;

  // A concurrent sync may have inserted the room after our first lookup.
  const raced = await admin
    .from('conversations')
    .select('id')
    .eq('account_id', config.account_id)
    .eq('external_room_id', roomId)
    .single();
  if (raced.error || !raced.data) {
    throw new Error(`Could not map Matrix room: ${created.error?.message}`);
  }
  return raced.data.id;
}

async function syncConfig(config: MatrixConfigRow): Promise<number> {
  const admin = supabaseAdmin();
  const url = new URL(
    `${normalizeHomeserverUrl(config.homeserver_url)}/_matrix/client/v3/sync`
  );
  url.searchParams.set('timeout', '0');
  if (config.sync_token) url.searchParams.set('since', config.sync_token);
  url.searchParams.set(
    'filter',
    JSON.stringify({
      room: { timeline: { limit: 100, types: ['m.room.message'] } },
    })
  );

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${decrypt(config.access_token)}` },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok)
    throw new Error(`Matrix sync failed with HTTP ${response.status}`);
  const payload = (await response.json()) as MatrixSyncResponse;

  let inserted = 0;
  for (const [roomId, room] of Object.entries(payload.rooms?.join ?? {})) {
    const channel = detectBridgeChannel(room);
    for (const event of room.timeline?.events ?? []) {
      const message = normalizeMatrixMessage(event);
      if (!message || message.sender === config.bot_user_id) continue;

      const conversationId = await resolveConversation(
        config,
        roomId,
        message.sender,
        channel
      );
      const mediaUrl = message.mediaUri
        ? `/api/matrix/media?uri=${encodeURIComponent(message.mediaUri)}`
        : null;
      const result = await admin
        .from('messages')
        .upsert(
          {
            conversation_id: conversationId,
            sender_type: 'customer',
            content_type: message.contentType,
            content_text: message.contentText,
            media_url: mediaUrl,
            status: 'sent',
            external_event_id: message.eventId,
            created_at: message.createdAt,
          },
          {
            onConflict: 'conversation_id,external_event_id',
            ignoreDuplicates: true,
          }
        )
        .select('id');
      if (result.error) throw result.error;
      if ((result.data?.length ?? 0) === 0) continue;

      inserted++;
      const unread = await admin
        .from('conversations')
        .select('unread_count')
        .eq('id', conversationId)
        .single();
      await admin
        .from('conversations')
        .update({
          last_message_text: message.contentText ?? `[${message.contentType}]`,
          last_message_at: message.createdAt,
          unread_count: (unread.data?.unread_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);
    }
  }

  await admin
    .from('matrix_config')
    .update({
      sync_token: payload.next_batch,
      last_sync_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', config.id);
  return inserted;
}

export async function syncAllMatrixAccounts(): Promise<{
  accounts: number;
  messages: number;
  errors: number;
}> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('matrix_config')
    .select('*')
    .eq('enabled', true);
  if (error) throw error;

  let messages = 0;
  let errors = 0;
  for (const config of (data ?? []) as MatrixConfigRow[]) {
    try {
      messages += await syncConfig(config);
    } catch (error) {
      errors++;
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`[matrix-sync] account ${config.account_id}:`, error);
      await admin
        .from('matrix_config')
        .update({
          last_error: detail.slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq('id', config.id);
    }
  }
  return { accounts: data?.length ?? 0, messages, errors };
}
