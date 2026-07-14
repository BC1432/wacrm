import { describe, expect, it } from 'vitest';

import { detectBridgeChannel, normalizeMatrixMessage } from './events';

describe('normalizeMatrixMessage', () => {
  it('normalizes a Matrix text event', () => {
    expect(
      normalizeMatrixMessage({
        type: 'm.room.message',
        event_id: '$event',
        sender: '@customer:example.com',
        origin_server_ts: 1_700_000_000_000,
        content: { msgtype: 'm.text', body: 'Hello' },
      })
    ).toEqual({
      eventId: '$event',
      sender: '@customer:example.com',
      contentType: 'text',
      contentText: 'Hello',
      mediaUri: null,
      createdAt: new Date(1_700_000_000_000).toISOString(),
    });
  });

  it('ignores unsupported events', () => {
    expect(normalizeMatrixMessage({ type: 'm.reaction' })).toBeNull();
    expect(
      normalizeMatrixMessage({
        type: 'm.room.message',
        event_id: '$event',
        sender: '@customer:example.com',
        content: { msgtype: 'm.sticker' },
      })
    ).toBeNull();
  });
});

describe('detectBridgeChannel', () => {
  it('reads mautrix bridge protocol state', () => {
    expect(
      detectBridgeChannel({
        state: {
          events: [
            { type: 'm.bridge', content: { protocol: { id: 'telegram' } } },
          ],
        },
      })
    ).toBe('telegram');
  });

  it('falls back to Matrix', () => {
    expect(detectBridgeChannel({})).toBe('matrix');
  });
});
