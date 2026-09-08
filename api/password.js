import { verifySession, verifyPassword, hashPassword, readCookie, signSession,
         cookieHeader, SESSION_COOKIE, SESSION_MAX_AGE } from '../lib/auth.js';
import { findUser, sessionPayload, MIN_OWN_PASSWORD } from '../lib/users.js';
import { loadStore, saveStore, canWrite } from '../lib/store.js';

/* 본인 비밀번호 변경.
   초기 비밀번호(mustChangePassword) 상태에서는 현재 비밀번호 확인을 생략하지 않는다 —
   쪽지로 받은 번호를 아는 사람만 바꿀 수 있어야 하기 때문. */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const s = await verifySession(readCookie(req.headers.cookie, SESSION_COOKIE), process.env.SESSION_SECRET || '');
  if (!s) return res.status(401).json({ error: 'unauthorized' });
  if (!canWrite()) return res.status(503).json({ error: 'store_unavailable', message: '저장소를 사용할 수 없습니다.' });

  const { current, password } = req.body || {};
  if (String(password || '').length < MIN_OWN_PASSWORD) {
    return res.status(400).json({ error: 'weak_password', message: `비밀번호는 ${MIN_OWN_PASSWORD}자 이상이어야 합니다.` });
  }

  const { data: store } = await loadStore({ fresh: true });
  const users = store.users || [];
  const user = findUser(store, s.u);
  if (!user) return res.status(404).json({ error: 'not_found' });

  if (!(await verifyPassword(String(current || ''), user.salt, user.hash))) {
    return res.status(401).json({ error: 'bad_current', message: '현재 비밀번호가 올바르지 않습니다.' });
  }
  if (String(current) === String(password)) {
    return res.status(400).json({ error: 'same_password', message: '기존과 다른 비밀번호를 정해주세요.' });
  }

  Object.assign(user, await hashPassword(String(password)), {
    mustChangePassword: false,
    passwordChangedAt: new Date().toISOString(),
  });
  await saveStore({ ...store, users });

  // 변경 즉시 새 세션을 발급해 mc 플래그를 푼다
  const token = await signSession(sessionPayload(user, SESSION_MAX_AGE), process.env.SESSION_SECRET);
  res.setHeader('Set-Cookie', cookieHeader(token));
  return res.status(200).json({ ok: true });
}
