import { hashPassword } from '../lib/auth.js';
import { loadStore, saveStore, canWrite } from '../lib/store.js';
import { ID_RE, normId, MIN_OWN_PASSWORD } from '../lib/users.js';

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
  const uid = normId(id);
  if (!ID_RE.test(uid)) {
    return res.status(400).json({ error: 'bad_id', message: '아이디는 한글 이름 또는 영문·숫자 2~20자입니다. (공백 불가)' });
  }
  if (!String(name || '').trim()) return res.status(400).json({ error: 'bad_name', message: '이름을 입력하세요.' });
  if (String(password || '').length < MIN_OWN_PASSWORD) {
    return res.status(400).json({ error: 'weak_password', message: `비밀번호는 ${MIN_OWN_PASSWORD}자 이상이어야 합니다.` });
  }

  const cred = await hashPassword(String(password));
  users.push({
    id: uid, name: String(name).trim(), role: 'admin', tabs: '*',
    schoolDepts: [], youthDepts: [], ...cred, updatedAt: new Date().toISOString(),
  });
  await saveStore({ ...store, users });
  return res.status(200).json({ ok: true });
}
