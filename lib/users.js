/* 대시보드 탭 정의 — 권한 부여 단위 */
export const TAB_DEFS = [
  { key: 'home',     label: '주간현황' },
  { key: 'sunday',   label: '주일예배' },
  { key: 'youth',    label: '청년교구' },
  { key: 'school',   label: '주일학교' },
  { key: 'wd',       label: '주중·새벽' },
  { key: 'leader',   label: '리더십' },
  { key: 'cell',     label: '소그룹' },
  { key: 'newfam',   label: '새가족' },
  { key: 'special',  label: '특별예배' },
  { key: 'yearcomp', label: '연도 비교' },
];
export const ALL_TABS = TAB_DEFS.map(t => t.key);

/* 아이디 규칙 — 교역자 이름을 그대로 쓰므로 한글을 허용한다 */
export const ID_RE = /^[가-힣ㄱ-ㅎa-z0-9._-]{2,20}$/;
export const normId = (v) => String(v ?? '').trim().toLowerCase();

/* 관리자가 발급하는 초기 비밀번호(전화번호 뒷자리 등)는 짧아도 되지만,
   본인이 직접 정하는 비밀번호는 최소 길이를 지킨다. */
export const MIN_INITIAL_PASSWORD = 4;
export const MIN_OWN_PASSWORD = 8;

export function listUsers(store) { return store?.users || []; }
export function findUser(store, id) {
  return listUsers(store).find(u => u.id === normId(id)) || null;
}

/* 권한 정규화 — '*'는 전체 허용 */
export function grantsOf(user) {
  if (!user) return { tabs: [], schoolDepts: null, youthDepts: null, admin: false };
  const admin = user.role === 'admin';
  const tabs = admin || user.tabs === '*' ? ALL_TABS
             : (user.tabs || []).filter(t => ALL_TABS.includes(t));
  return {
    admin,
    tabs: tabs.includes('home') ? tabs : ['home', ...tabs],   // 주간현황은 공통
    schoolDepts: admin || !user.schoolDepts?.length ? null : user.schoolDepts,
    youthDepts:  admin || !user.youthDepts?.length  ? null : user.youthDepts,
  };
}

/* 세션에 담는 최소 정보 (쿠키 크기를 줄이려 짧은 키를 쓴다) */
export function sessionPayload(user, maxAgeSec) {
  const g = grantsOf(user);
  return {
    u: user.id, n: user.name, a: g.admin ? 1 : 0,
    t: g.tabs, sd: g.schoolDepts, yd: g.youthDepts,
    mc: user.mustChangePassword ? 1 : 0,   // 초기 비밀번호 상태 — 변경 전까지 대시보드 접근 차단
    exp: Date.now() + maxAgeSec * 1000,
  };
}
