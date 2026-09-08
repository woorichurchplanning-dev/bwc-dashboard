import { hashPassword } from '../lib/auth.js';
import { loadStore, saveStore, canWrite } from '../lib/store.js';

/* 최초 관리자 1명을 만드는 일회성 경로.
   계정이 하나라도 있으면 즉시 닫힌다. 코드는 환경변수로만 전달된다. */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!canWrite()) return res.status(503).json({ error: 'store_unavailable' });

  const { data: store } = await loadStore({ fresh: true });
  const users = store.users || [];
  if (users.length > 0) {
    return res.status(410).json({ error: 'already_initialized', message: '이미 계정이 있어 초기 설정이 닫혔습니다.' });
  }

  const expected = process.env.BOOTSTRAP_CODE || '';
  const { code, id, name, password } = req.body || {};
  if (!expected || String(code || '') !== expected) {
    return res.status(401).json({ error: 'bad_code', message: '설정 코드가 올바르지 않습니다.' });
  }
  const uid = String(id || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(uid)) {
    return res.status(400).json({ error: 'bad_id', message: '아이디는 영문 소문자·숫자·. _ - 3~32자입니다.' });
  }
  if (!String(name || '').trim()) return res.status(400).json({ error: 'bad_name', message: '이름을 입력하세요.' });
  if (String(password || '').length < 8) {
    return res.status(400).json({ error: 'weak_password', message: '비밀번호는 8자 이상이어야 합니다.' });
  }

  const cred = await hashPassword(String(password));
  users.push({
    id: uid, name: String(name).trim(), role: 'admin', tabs: '*',
    schoolDepts: [], youthDepts: [], ...cred, updatedAt: new Date().toISOString(),
  });
  await saveStore({ ...store, users });
  return res.status(200).json({ ok: true });
}
