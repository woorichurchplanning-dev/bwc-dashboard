#!/usr/bin/env node
/* 교역자 계정 일괄 생성.
     1) vercel env pull .env.local --environment=production
     2) node scripts/bulk-users.mjs scripts/roster.csv           # 미리보기
     3) node scripts/bulk-users.mjs scripts/roster.csv --apply   # 실제 생성
   CSV 열: 아이디,이름,역할,탭,주일학교부서,초기비밀번호
   초기비밀번호가 빈 행은 건너뛴다. 기존 아이디는 권한만 갱신하고 비밀번호는 두지 않는다. */
import { readFileSync } from 'node:fs';
import { hashPassword } from '../lib/auth.js';
import { ALL_TABS, ID_RE, normId, MIN_INITIAL_PASSWORD } from '../lib/users.js';

const file = process.argv[2];
const apply = process.argv.includes('--apply');
if (!file) { console.error('사용법: node scripts/bulk-users.mjs <csv> [--apply]'); process.exit(1); }

// .env.local 이 있으면 읽어 저장소 접근 정보를 채운다
try {
  for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
    const i = line.indexOf('=');
    if (i > 0 && !line.startsWith('#')) {
      const k = line.slice(0, i).trim();
      if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^"|"$/g, '');
    }
  }
} catch { /* 없으면 환경변수를 그대로 쓴다 */ }

const { loadStore, saveStore, canWrite } = await import('../lib/store.js');
if (!canWrite()) {
  console.error('저장소에 접근할 수 없습니다. `vercel env pull .env.local --environment=production` 후 다시 실행하세요.');
  process.exit(1);
}

const SCHOOL_DEPTS = ['사랑부','영아부','유아부','유치부','송림유년','서현유년','송림초등',
  '서현초등','송림소년','서현소년','송림청소년부','중등부','고등부'];

const rows = readFileSync(file, 'utf8').split('\n')
  .map(l => l.trim()).filter(l => l && !l.startsWith('#'));
const header = rows.shift();

const { data: store } = await loadStore({ fresh: true });
const users = store.users || [];
const plan = [];
const skipped = [];

for (const line of rows) {
  const [rawId, name, role = 'staff', tabsRaw = '', deptsRaw = '', pw = ''] =
    line.split(',').map(s => (s || '').trim());
  const id = normId(rawId);
  if (!ID_RE.test(id)) { skipped.push(`${rawId}: 아이디 형식`); continue; }
  if (!name) { skipped.push(`${id}: 이름 없음`); continue; }

  const exists = users.findIndex(u => u.id === id);
  if (!pw && exists < 0) { skipped.push(`${id}: 초기 비밀번호 없음(신규라 필요)`); continue; }
  if (pw && pw.length < MIN_INITIAL_PASSWORD) { skipped.push(`${id}: 비밀번호가 너무 짧음`); continue; }

  const tabs = role === 'admin' ? '*'
    : tabsRaw.split('/').map(s => s.trim()).filter(t => ALL_TABS.includes(t));
  const schoolDepts = deptsRaw.split('/').map(s => s.trim()).filter(d => SCHOOL_DEPTS.includes(d));
  plan.push({ id, name, role: role === 'admin' ? 'admin' : 'staff', tabs, schoolDepts, pw, exists });
}

console.log(`\n대상 ${plan.length}명 (건너뜀 ${skipped.length}건)\n`);
console.log('아이디'.padEnd(10) + '이름'.padEnd(18) + '역할'.padEnd(7) + '탭'.padEnd(24) + '주일학교');
for (const p of plan) {
  console.log(p.id.padEnd(10) + p.name.padEnd(16) + p.role.padEnd(7) +
    (p.tabs === '*' ? '전체' : p.tabs.join(',')).padEnd(24) +
    (p.schoolDepts.join(',') || '-') + (p.exists >= 0 ? '   (기존 갱신)' : ''));
}
if (skipped.length) { console.log('\n건너뛴 행:'); skipped.forEach(s => console.log('  - ' + s)); }

if (!apply) { console.log('\n미리보기입니다. 실제로 만들려면 --apply 를 붙이세요.'); process.exit(0); }

for (const p of plan) {
  const rec = { id: p.id, name: p.name, role: p.role, tabs: p.tabs,
                schoolDepts: p.schoolDepts, youthDepts: [], updatedAt: new Date().toISOString() };
  if (p.pw) Object.assign(rec, await hashPassword(p.pw), { mustChangePassword: true });
  if (p.exists >= 0) Object.assign(users[p.exists], rec);
  else users.push(rec);
}
await saveStore({ ...store, users });
console.log(`\n완료 — 저장소 계정 ${users.length}명`);
console.log('각자 첫 로그인에서 비밀번호를 바꾸게 됩니다.');
