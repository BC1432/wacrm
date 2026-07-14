import type { MessagingChannel } from '@/types';

export const MESSAGING_CHANNELS: readonly MessagingChannel[] = [
  'whatsapp',
  'telegram',
  'signal',
  'instagram',
  'matrix',
  'xmpp',
] as const;

export function isMessagingChannel(value: unknown): value is MessagingChannel {
  return (
    typeof value === 'string' &&
    (MESSAGING_CHANNELS as readonly string[]).includes(value)
  );
}

export function channelLabel(channel: MessagingChannel): string {
  return channel.charAt(0).toUpperCase() + channel.slice(1);
}
