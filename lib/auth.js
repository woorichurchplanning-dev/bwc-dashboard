/* 인증 공용 유틸 — Edge 미들웨어와 Node 함수 양쪽에서 쓴다.
   외부 의존성 없이 Web Crypto만 사용한다. */

const enc = (s) => new TextEncoder().encode(s);

const b64url = (bytes) => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (s) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

/* ── 비밀번호: PBKDF2-SHA256 ── */
export const PBKDF2_ITER = 210000;

export async function hashPassword(password, saltB64) {
  const salt = saltB64 ? unb64url(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' }, key, 256);
  return { salt: b64url(salt), hash: b64url(new Uint8Array(bits)) };
}

/* 타이밍 공격을 피하려고 길이·내용을 상수 시간으로 비교한다 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(password, saltB64, expectedHash) {
  if (!saltB64 || !expectedHash) return false;
  const { hash } = await hashPassword(password, saltB64);
  return timingSafeEqual(hash, expectedHash);
}

/* ── 세션 토큰: payload.HMAC ── */
async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

export async function signSession(payload, secret) {
  const body = b64url(enc(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

export async function verifySession(token, secret) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc(body));
  if (!timingSafeEqual(sig, b64url(new Uint8Array(expected)))) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(unb64url(body)));
    if (!payload.exp || payload.exp < Date.now()) return null;   // 만료
    return payload;
  } catch { return null; }
}

export const SESSION_COOKIE = 'bwc_session';
export const SESSION_MAX_AGE = 60 * 60 * 12;   // 12시간

export function cookieHeader(token, maxAge = SESSION_MAX_AGE) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  return parts.join('; ');
}

export function readCookie(header, name) {
  if (!header) return '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return '';
}
