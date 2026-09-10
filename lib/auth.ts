/**
 * Single-admin session auth.
 *
 * A session is an HMAC-signed expiry stamp held in an HttpOnly cookie — no
 * database table, no library. Uses Web Crypto so the exact same code runs in
 * `proxy.ts` and inside Server Actions.
 */

export const SESSION_COOKIE = "zuri_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function secret() {
  const value = process.env.AUTH_SECRET?.trim();
  if (!value || value.length < 16) {
    throw new Error(
      "AUTH_SECRET must be set to at least 16 characters. See .env.example.",
    );
  }
  return value;
}

function adminPassword() {
  const value = process.env.AUTH_PASSWORD?.trim();
  if (!value) {
    throw new Error("AUTH_PASSWORD must be set. See .env.example.");
  }
  return value;
}

/** True when auth is configured at all — used to fail closed, never open. */
export function authConfigured() {
  return Boolean(
    process.env.AUTH_SECRET?.trim() && process.env.AUTH_PASSWORD?.trim(),
  );
}

function toBase64Url(bytes: ArrayBuffer) {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return toBase64Url(signature);
}

/** Length-independent comparison, so a mismatch leaks no timing signal. */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function checkPassword(candidate: string) {
  const expected = adminPassword();
  // Hash both sides first so the comparison length never reveals the secret's.
  const [a, b] = await Promise.all([sign(candidate), sign(expected)]);
  return safeEqual(a, b);
}

export async function createSessionToken() {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = String(expiresAt);
  return `${payload}.${await sign(payload)}`;
}

export async function isValidSessionToken(token: string | undefined | null) {
  if (!token) return false;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return false;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;

  try {
    return safeEqual(signature, await sign(payload));
  } catch {
    return false;
  }
}
