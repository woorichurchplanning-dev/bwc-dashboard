import { verifyPassword, signSession, cookieHeader, SESSION_MAX_AGE } from '../lib/auth.js';
import { findUser, sessionPayload } from '../lib/users.js';
import { loadStore } from '../lib/store.js';

/* 무차별 대입 완화 — 인스턴스 메모리 기준의 가벼운 제한.

   예전에는 IP 하나만 보고 셌다. 교회 안에서는 모두가 같은 공인 IP 를 쓰기
   때문에, 여러 사람이 각자 비밀번호를 몇 번 틀리면 그 합이 금방 여덟을
   넘어 아무도 못 들어갔다. 실제로 그렇게 막혔다.
   이제 'IP + 아이디' 로 세고, 실패했을 때만 센다. 한 사람이 한 아이디를
   계속 두드리는 것만 막힌다. */
const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_TRIES = 10;

function recent(key) {
  const rec = attempts.get(key);
  if (!rec || Date.now() - rec.first > WINDOW_MS) return 0;
  return rec.n;
}
function noteFail(key) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now - rec.first > WINDOW_MS) attempts.set(key, { first: now, n: 1 });
  else rec.n += 1;
  if (attempts.size > 5000) attempts.clear();   // 메모리가 무한히 늘지 않게
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!process.env.SESSION_SECRET) return res.status(500).json({ error: 'server_misconfigured' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const { id, password } = req.body || {};
  const key = `${ip}|${String(id || '').trim().toLowerCase()}`;
  if (recent(key) >= MAX_TRIES) return res.status(429).json({ error: 'too_many_attempts' });

  const { data: store } = await loadStore();
  const user = findUser(store, id);
  // 아이디가 없어도 같은 시간을 쓰도록 더미 해시를 검증한다 (계정 존재 여부 노출 방지)
  const ok = user
    ? await verifyPassword(String(password || ''), user.salt, user.hash)
    : await verifyPassword('x', 'AAAAAAAAAAAAAAAAAAAAAA', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');

  if (!user || !ok) { noteFail(key); return res.status(401).json({ error: 'invalid_credentials' }); }

  attempts.delete(key);
  const payload = sessionPayload(user, SESSION_MAX_AGE);
  const token = await signSession(payload, process.env.SESSION_SECRET);
  res.setHeader('Set-Cookie', cookieHeader(token));
  return res.status(200).json({ ok: true, user: { id: user.id, name: user.name, admin: payload.a === 1, tabs: payload.t } });
}
