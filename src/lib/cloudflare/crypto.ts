// ============================================================
// Cloudflare-native auth crypto.
//
// These helpers use Web Crypto and web-standard base64 helpers so they
// run in Workers and Node-based tests without Supabase or Node crypto.
// The stored password format is intentionally self-describing:
//
//   pbkdf2_sha256$<iterations>$<salt_base64url>$<hash_base64url>
//
// PBKDF2 is available in the Workers Web Crypto runtime today. If we
// later adopt a memory-hard KDF via a vetted library, this format lets
// us version new hashes without breaking old accounts.
// ============================================================

const PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256";
const PASSWORD_HASH_ITERATIONS = 210_000;
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_HASH_BITS = 256;
const SESSION_TOKEN_BYTES = 32;

export interface PasswordHashParts {
  algorithm: typeof PASSWORD_HASH_ALGORITHM;
  iterations: number;
  salt: string;
  hash: string;
}

export interface GeneratedOpaqueToken {
  plaintext: string;
  hash: string;
}

export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export async function hashPassword(password: string): Promise<string> {
  assertUsablePassword(password);
  const salt = randomBase64Url(PASSWORD_SALT_BYTES);
  const hash = await pbkdf2(password, salt, PASSWORD_HASH_ITERATIONS);
  return [
    PASSWORD_HASH_ALGORITHM,
    String(PASSWORD_HASH_ITERATIONS),
    salt,
    hash,
  ].join("$");
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  if (!password || !storedHash) return false;
  const parsed = parsePasswordHash(storedHash);
  if (!parsed) return false;
  const candidate = await pbkdf2(password, parsed.salt, parsed.iterations);
  return timingSafeStringEqual(candidate, parsed.hash);
}

export function parsePasswordHash(value: string): PasswordHashParts | null {
  const [algorithm, iterationsRaw, salt, hash] = value.split("$");
  const iterations = Number(iterationsRaw);

  if (
    algorithm !== PASSWORD_HASH_ALGORITHM ||
    !Number.isSafeInteger(iterations) ||
    iterations <= 0 ||
    !salt ||
    !hash
  ) {
    return null;
  }

  return { algorithm, iterations, salt, hash };
}

export async function generateOpaqueToken(): Promise<GeneratedOpaqueToken> {
  const plaintext = randomBase64Url(SESSION_TOKEN_BYTES);
  return { plaintext, hash: await sha256Hex(plaintext) };
}

export async function hashOpaqueToken(token: string): Promise<string> {
  return sha256Hex(token);
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return bytesToHex(new Uint8Array(bytes));
}

export function timingSafeStringEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;

  let diff = 0;
  for (let i = 0; i < aBytes.length; i += 1) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

function assertUsablePassword(password: string): void {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
}

async function pbkdf2(
  password: string,
  saltBase64Url: string,
  iterations: number
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64UrlToArrayBuffer(saltBase64Url),
      iterations,
    },
    key,
    PASSWORD_HASH_BITS
  );

  return bytesToBase64Url(new Uint8Array(bits));
}

function randomBase64Url(bytes: number): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return bytesToBase64Url(value);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
