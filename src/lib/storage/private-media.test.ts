import { afterEach, describe, expect, it } from 'vitest';
import { parseStorageMediaUrl } from './private-media';

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
});

describe('parseStorageMediaUrl', () => {
  it('parses signed private media URLs from known buckets', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';

    expect(
      parseStorageMediaUrl(
        'https://abc.supabase.co/storage/v1/object/sign/chat-media/account-123/file.pdf?token=x',
      ),
    ).toEqual({
      bucket: 'chat-media',
      path: 'account-123/file.pdf',
    });
  });

  it('ignores external and non-media URLs', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';

    expect(parseStorageMediaUrl('https://cdn.example.com/file.pdf')).toBeNull();
    expect(
      parseStorageMediaUrl(
        'https://abc.supabase.co/storage/v1/object/sign/avatars/user/avatar.png?token=x',
      ),
    ).toBeNull();
  });
});
