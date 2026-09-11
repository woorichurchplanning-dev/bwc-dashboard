/* 대시보드 탭 정의 — 권한 부여 단위 */
export const TAB_DEFS = [
  { key: 'home',     label: '주간현황' },
  { key: 'sunday',   label: '주일예배' },
  { key: 'youth',    label: '청년교구' },
  { key: 'school',   label: '주일학교' },
  { key: 'wd',       label: '주중예배' },
  { key: 'district', label: '교구' },
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

/* 권한을 줄 수 있는 단위 */
export const SCHOOL_DEPTS = ['사랑부','영아부','유아부','유치부','송림유년부','서현유년부','송림초등부',
  '서현초등부','송림소년부','서현소년부','송림청소년부','서현중등부','서현고등부'];
export const YOUTH_DEPTS = ['1청년부','2청년부','3청년부','4청년부'];
/* 팀 구성은 해마다 바뀌므로 넉넉히 두고, 실제로는 데이터에 있는 팀만 화면에 나온다 */
export const YOUTH_TEAMS = YOUTH_DEPTS.flatMap(d => ['1팀','2팀','3팀','4팀'].map(t => `${d} ${t}`));
export const DISTRICTS = Array.from({ length: 14 }, (_, i) => `${i + 1}교구`);

/* 계정을 묶어 보는 단위. 권한과는 상관없이 '누가 어디 소속인지'만 나타낸다.
   목록에 없는 값도 넣을 수 있게 두되, 관리자 화면에서 고를 수 있게 추려 둔다. */
export const DEPTS = ['교구', '주일학교', '청년교구', '기획팀', '예배', '안내부', '주차', '디렉터', '사무'];

export function listUsers(store) { return store?.users || []; }
export function findUser(store, id) {
  return listUsers(store).find(u => u.id === normId(id)) || null;
}

/* 권한 정규화 — '*'는 전체 허용 */
export function grantsOf(user) {
  if (!user) return { tabs: [], schoolDepts: null, youthDepts: null, youthTeams: null, districts: null, admin: false };
  const admin = user.role === 'admin';
  // 예전 leader/cell 권한은 통합된 district 로 옮겨 준다
  const raw = admin || user.tabs === '*' ? ALL_TABS : (user.tabs || []);
  const mapped = raw.map(t => (t === 'leader' || t === 'cell') ? 'district' : t);
  const tabs = [...new Set(mapped.filter(t => ALL_TABS.includes(t)))];
  return {
    admin,
    tabs: tabs.includes('home') ? tabs : ['home', ...tabs],   // 주간현황은 공통
    // null = 제한 없음, 배열 = 그 항목만
    schoolDepts: admin || !user.schoolDepts?.length ? null : user.schoolDepts,
    youthDepts:  admin || !user.youthDepts?.length  ? null : user.youthDepts,
    youthTeams:  admin || !user.youthTeams?.length  ? null : user.youthTeams,
    districts:   admin || !user.districts?.length   ? null : user.districts,
  };
}

/* 세션에 담는 최소 정보 (쿠키 크기를 줄이려 짧은 키를 쓴다) */
export function sessionPayload(user, maxAgeSec) {
  const g = grantsOf(user);
  return {
    u: user.id, n: user.name, a: g.admin ? 1 : 0,
    t: g.tabs, sd: g.schoolDepts, yd: g.youthDepts, yt: g.youthTeams, di: g.districts,
    mc: user.mustChangePassword ? 1 : 0,   // 초기 비밀번호 상태 — 변경 전까지 대시보드 접근 차단
    exp: Date.now() + maxAgeSec * 1000,
  };
}
