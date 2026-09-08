import { verifySession, readCookie, SESSION_COOKIE, hashPassword } from '../lib/auth.js';
import { ALL_TABS, TAB_DEFS, grantsOf, ID_RE, normId, MIN_INITIAL_PASSWORD,
         SCHOOL_DEPTS, YOUTH_DEPTS, YOUTH_TEAMS, DISTRICTS } from '../lib/users.js';
import { loadStore, saveStore, canWrite } from '../lib/store.js';

const clean = (s, max = 40) => String(s ?? '').trim().slice(0, max);
const pick = (arr, allowed) => (Array.isArray(arr) ? arr.map(x => clean(x)).filter(x => allowed.includes(x)) : []);

/* 비밀번호 해시를 절대 밖으로 내보내지 않는다 */
const publicView = (u) => {
  const g = grantsOf(u);
  return {
    id: u.id, name: u.name, role: u.role,
    tabs: u.tabs === '*' ? '*' : (u.tabs || []),
    effectiveTabs: g.tabs,
    schoolDepts: u.schoolDepts || [],
    youthDepts: u.youthDepts || [],
    youthTeams: u.youthTeams || [],
    districts: u.districts || [],
    updatedAt: u.updatedAt || null,
    mustChangePassword: !!u.mustChangePassword,   // 초기 비밀번호 상태 표시
  };
};

export default async function handler(req, res) {
  const s = await verifySession(readCookie(req.headers.cookie, SESSION_COOKIE), process.env.SESSION_SECRET || '');
  if (!s) return res.status(401).json({ error: 'unauthorized' });
  if (s.a !== 1) return res.status(403).json({ error: 'forbidden' });

  const { data: store, readOnly } = await loadStore({ fresh: req.method !== 'GET' });
  const users = store.users || [];

  if (req.method === 'GET') {
    return res.status(200).json({
      readOnly: readOnly || !canWrite(),
      me: s.u,
      tabDefs: TAB_DEFS,
      schoolDepts: SCHOOL_DEPTS,
      youthDepts: YOUTH_DEPTS,
      youthTeams: YOUTH_TEAMS,
      districts: DISTRICTS,
      users: users.map(publicView),
    });
  }

  if (!canWrite()) {
    return res.status(503).json({
      error: 'read_only',
      message: 'GITHUB_TOKEN이 설정되지 않아 화면에서 계정을 수정할 수 없습니다. scripts/user.mjs 를 쓰거나 토큰을 등록하세요.',
    });
  }

  const body = req.body || {};
  const id = normId(clean(body.id, 20));
  const i = users.findIndex(u => u.id === id);

  try {
    if (req.method === 'POST' || req.method === 'PUT') {
      if (!ID_RE.test(id)) {
        return res.status(400).json({ error: 'bad_id', message: '아이디는 한글 이름 또는 영문·숫자 2~20자입니다. (공백 불가)' });
      }
      const name = clean(body.name, 40);
      if (!name) return res.status(400).json({ error: 'bad_name', message: '이름을 입력하세요.' });

      const role = body.role === 'admin' ? 'admin' : 'staff';
      const tabs = role === 'admin' ? '*'
        : (body.tabs === '*' ? '*' : pick(body.tabs, ALL_TABS));
      const schoolDepts = pick(body.schoolDepts, SCHOOL_DEPTS);
      const youthDepts  = pick(body.youthDepts, YOUTH_DEPTS);
      const youthTeams  = pick(body.youthTeams, YOUTH_TEAMS);
      const districts   = pick(body.districts, DISTRICTS);

      // 관리자가 넣는 값은 '초기 비밀번호'다. 전화번호 뒷자리처럼 짧아도 받되,
      // 본인이 직접 바꾸기 전까지는 대시보드에 들어가지 못하게 표시한다.
      let cred = null;
      if (body.password) {
        if (String(body.password).length < MIN_INITIAL_PASSWORD) {
          return res.status(400).json({ error: 'weak_password', message: `초기 비밀번호는 ${MIN_INITIAL_PASSWORD}자 이상이어야 합니다.` });
        }
        cred = { ...(await hashPassword(String(body.password))), mustChangePassword: true };
      }

      if (i < 0) {
        if (!cred) return res.status(400).json({ error: 'password_required', message: '새 계정은 비밀번호가 필요합니다.' });
        users.push({ id, name, role, tabs, schoolDepts, youthDepts, youthTeams, districts,
                     ...cred, updatedAt: new Date().toISOString() });
      } else {
        // 마지막 관리자의 권한을 내리지 못하게 막는다
        if (users[i].role === 'admin' && role !== 'admin'
            && users.filter(u => u.role === 'admin').length <= 1) {
          return res.status(400).json({ error: 'last_admin', message: '마지막 관리자의 역할은 바꿀 수 없습니다.' });
        }
        Object.assign(users[i], { name, role, tabs, schoolDepts, youthDepts, youthTeams, districts,
                                  updatedAt: new Date().toISOString() }, cred || {});
      }
    } else if (req.method === 'DELETE') {
      if (i < 0) return res.status(404).json({ error: 'not_found' });
      if (id === s.u) return res.status(400).json({ error: 'self_delete', message: '본인 계정은 삭제할 수 없습니다.' });
      if (users[i].role === 'admin' && users.filter(u => u.role === 'admin').length <= 1) {
        return res.status(400).json({ error: 'last_admin', message: '마지막 관리자는 삭제할 수 없습니다.' });
      }
      users.splice(i, 1);
    } else {
      return res.status(405).json({ error: 'method_not_allowed' });
    }

    await saveStore({ ...store, users });
    return res.status(200).json({ ok: true, users: users.map(publicView) });
  } catch (e) {
    console.error('계정 저장 실패:', e);
    return res.status(500).json({ error: 'save_failed', message: String(e.message || e).slice(0, 200) });
  }
}
