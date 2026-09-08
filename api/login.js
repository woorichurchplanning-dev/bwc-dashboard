import { verifyPassword, signSession, cookieHeader, SESSION_MAX_AGE } from '../lib/auth.js';
import { findUser, sessionPayload } from '../lib/users.js';
import { loadStore } from '../lib/store.js';

/* 무차별 대입 완화 — 인스턴스 메모리 기준의 가벼운 제한 */
const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_TRIES = 8;

function tooMany(key) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now - rec.first > WINDOW_MS) { attempts.set(key, { first: now, n: 1 }); return false; }
  rec.n += 1;
  return rec.n > MAX_TRIES;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!process.env.SESSION_SECRET) return res.status(500).json({ error: 'server_misconfigured' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const { id, password } = req.body || {};
  if (tooMany(ip)) return res.status(429).json({ error: 'too_many_attempts' });

  const { data: store } = await loadStore();
  const user = findUser(store, id);
  // 아이디가 없어도 같은 시간을 쓰도록 더미 해시를 검증한다 (계정 존재 여부 노출 방지)
  const ok = user
    ? await verifyPassword(String(password || ''), user.salt, user.hash)
    : await verifyPassword('x', 'AAAAAAAAAAAAAAAAAAAAAA', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');

  if (!user || !ok) return res.status(401).json({ error: 'invalid_credentials' });

  attempts.delete(ip);
  const payload = sessionPayload(user, SESSION_MAX_AGE);
  const token = await signSession(payload, process.env.SESSION_SECRET);
  res.setHeader('Set-Cookie', cookieHeader(token));
  return res.status(200).json({ ok: true, user: { id: user.id, name: user.name, admin: payload.a === 1, tabs: payload.t } });
}
