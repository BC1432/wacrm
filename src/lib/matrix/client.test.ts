import { vi } from 'vitest';

vi.mock('matrix-js-sdk', () => ({
  createClient: vi.fn(),
  MsgType: {
    Text: 'm.text',
  },
}));

import { describe, expect, it } from 'vitest';
import { normalizeHomeserverUrl, matrixWhoAmI } from './client';

describe('normalizeHomeserverUrl', () => {
  it('should accept valid homeserver URLs', () => {
    expect(normalizeHomeserverUrl('https://matrix.org')).toBe('https://matrix.org');
    expect(normalizeHomeserverUrl('https://matrix.org/')).toBe('https://matrix.org');
    expect(normalizeHomeserverUrl('matrix.org')).toBe('https://matrix.org');
  });

  it('should reject URLs with subpaths, hash fragments, or queries', () => {
    expect(() => normalizeHomeserverUrl('https://app.element.io/#/room/#community:matrix.org')).toThrow(
      'Invalid homeserver URL'
    );
    expect(() => normalizeHomeserverUrl('https://matrix.org/subpath')).toThrow(
      'Invalid homeserver URL'
    );
    expect(() => normalizeHomeserverUrl('https://matrix.org?query=1')).toThrow(
      'Invalid homeserver URL'
    );
  });
});

describe('matrixWhoAmI', () => {
  it('should return identity if server returns 200 JSON', async () => {
    const mockWhoAmIResponse = { user_id: '@user:matrix.org' };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockWhoAmIResponse,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await matrixWhoAmI('https://matrix.org', 'token');
    expect(result).toEqual(mockWhoAmIResponse);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://matrix.org/_matrix/client/v3/account/whoami',
      expect.any(Object)
    );
    vi.unstubAllGlobals();
  });

  it('should throw friendly error if server does not return JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error('Unexpected token <');
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(matrixWhoAmI('https://matrix.org', 'token')).rejects.toThrow(
      'Matrix rejected response: The homeserver did not return valid JSON'
    );
    vi.unstubAllGlobals();
  });

  it('should throw friendly error if connection fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(matrixWhoAmI('https://matrix.org', 'token')).rejects.toThrow(
      'Matrix rejected request: Could not connect to homeserver'
    );
    vi.unstubAllGlobals();
  });
});
