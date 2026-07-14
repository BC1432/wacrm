import {
  Camera,
  MessageCircle,
  Network,
  Radio,
  Send,
  Waypoints,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { channelLabel } from '@/lib/messaging/channels';
import type { MessagingChannel } from '@/types';

const META: Record<
  MessagingChannel,
  { icon: typeof MessageCircle; className: string }
> = {
  whatsapp: {
    icon: MessageCircle,
    className: 'bg-emerald-500/10 text-emerald-600',
  },
  telegram: { icon: Send, className: 'bg-sky-500/10 text-sky-600' },
  signal: { icon: Radio, className: 'bg-blue-500/10 text-blue-600' },
  instagram: { icon: Camera, className: 'bg-pink-500/10 text-pink-600' },
  matrix: { icon: Network, className: 'bg-zinc-500/10 text-zinc-600' },
  xmpp: { icon: Waypoints, className: 'bg-amber-500/10 text-amber-600' },
};

export function ChannelBadge({
  channel = 'whatsapp',
  compact = false,
  className,
}: {
  channel?: MessagingChannel;
  compact?: boolean;
  className?: string;
}) {
  const meta = META[channel];
  const Icon = meta.icon;
  return (
    <span
      title={channelLabel(channel)}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
        meta.className,
        className
      )}
    >
      <Icon className="size-3" />
      {!compact ? channelLabel(channel) : null}
    </span>
  );
}
