/**
 * Crypto compatible con Edge Runtime (middleware) y Node (API routes).
 * Usa Web Crypto API global - no importar crypto de Node.
 */

function teEncode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function utf8ToBase64Url(s: string): string {
  return bytesToBase64Url(teEncode(s));
}

function base64UrlToUtf8(s: string): string {
  return new TextDecoder().decode(base64UrlToBytes(s));
}

async function sha256Base64Url(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", teEncode(text) as BufferSource);
  return bytesToBase64Url(new Uint8Array(digest));
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signPayload(payload: string, secret: string): Promise<string> {
  const sig = await sha256Base64Url(`${payload}.${secret}`);
  return `${utf8ToBase64Url(payload)}.${sig}`;
}

export async function unsignPayload(token: string, secret: string): Promise<string | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  let payload: string;
  try {
    payload = base64UrlToUtf8(body);
  } catch {
    return null;
  }
  const expected = await sha256Base64Url(`${payload}.${secret}`);
  return timingSafeEqualStr(sig, expected) ? payload : null;
}

export function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}