import { supabaseAdmin } from '@/lib/flows/admin-client';

const PRIVATE_MEDIA_BUCKETS = new Set(['chat-media', 'flow-media']);
const META_SIGNED_URL_TTL_SECONDS = 60 * 60;

interface StorageLocation {
  bucket: string;
  path: string;
}

export function parseStorageMediaUrl(rawUrl: string): StorageLocation | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;

  let appOrigin: string;
  let url: URL;
  try {
    appOrigin = new URL(supabaseUrl).origin;
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.origin !== appOrigin) return null;

  const marker =
    url.pathname.includes('/storage/v1/object/sign/')
      ? '/storage/v1/object/sign/'
      : url.pathname.includes('/storage/v1/object/public/')
        ? '/storage/v1/object/public/'
        : null;
  if (!marker) return null;

  const rest = url.pathname.slice(url.pathname.indexOf(marker) + marker.length);
  const [bucket, ...pathParts] = rest.split('/');
  if (!PRIVATE_MEDIA_BUCKETS.has(bucket) || pathParts.length === 0) return null;

  return { bucket, path: decodeURIComponent(pathParts.join('/')) };
}

export async function resolveMetaMediaUrl(rawUrl: string): Promise<string> {
  const location = parseStorageMediaUrl(rawUrl);
  if (!location) return rawUrl;

  const { data, error } = await supabaseAdmin()
    .storage
    .from(location.bucket)
    .createSignedUrl(location.path, META_SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? 'Could not sign private media URL');
  }

  return data.signedUrl;
}
