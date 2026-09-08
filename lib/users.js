import users from '../users.json' with { type: 'json' };

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

export function listUsers() { return users.users || []; }
export function findUser(id) {
  return listUsers().find(u => u.id === String(id || '').trim().toLowerCase()) || null;
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
    exp: Date.now() + maxAgeSec * 1000,
  };
}
