import type { ContentType, MessagingChannel } from '@/types';
import { isMessagingChannel } from '@/lib/messaging/channels';

export interface MatrixEvent {
  event_id?: string;
  sender?: string;
  type?: string;
  origin_server_ts?: number;
  content?: Record<string, unknown>;
}

export interface MatrixRoomSync {
  state?: { events?: MatrixEvent[] };
  timeline?: { events?: MatrixEvent[] };
}

export interface NormalizedMatrixMessage {
  eventId: string;
  sender: string;
  contentType: ContentType;
  contentText: string | null;
  mediaUri: string | null;
  createdAt: string;
}

const MEDIA_TYPES: Record<string, ContentType> = {
  'm.image': 'image',
  'm.file': 'document',
  'm.audio': 'audio',
  'm.video': 'video',
};

export function normalizeMatrixMessage(
  event: MatrixEvent
): NormalizedMatrixMessage | null {
  if (
    event.type !== 'm.room.message' ||
    !event.event_id ||
    !event.sender ||
    !event.content
  ) {
    return null;
  }

  const msgtype = event.content.msgtype;
  if (
    msgtype !== 'm.text' &&
    !(typeof msgtype === 'string' && MEDIA_TYPES[msgtype])
  ) {
    return null;
  }

  const contentType =
    msgtype === 'm.text' ? 'text' : MEDIA_TYPES[msgtype as string];
  return {
    eventId: event.event_id,
    sender: event.sender,
    contentType,
    contentText:
      typeof event.content.body === 'string' ? event.content.body : null,
    mediaUri: typeof event.content.url === 'string' ? event.content.url : null,
    createdAt: new Date(event.origin_server_ts ?? Date.now()).toISOString(),
  };
}

export function detectBridgeChannel(
  room: MatrixRoomSync,
  fallback: MessagingChannel = 'matrix'
): MessagingChannel {
  for (const event of room.state?.events ?? []) {
    if (event.type !== 'm.bridge' && event.type !== 'uk.half-shot.bridge')
      continue;
    const content = event.content ?? {};
    const protocol = content.protocol;
    const candidate =
      typeof protocol === 'object' && protocol !== null
        ? (protocol as Record<string, unknown>).id
        : content.bridge;
    if (isMessagingChannel(candidate)) return candidate;
  }
  return fallback;
}
