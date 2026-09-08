#!/usr/bin/env node
/* 대시보드 계정 관리 CLI — 비밀번호는 입력받아 해시만 저장한다(평문 미보관). */
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { hashPassword } from '../lib/auth.js';
import { ALL_TABS, TAB_DEFS } from '../lib/users.js';

const FILE = new URL('../users.json', import.meta.url);
const load = () => JSON.parse(readFileSync(FILE, 'utf8'));
const save = (d) => writeFileSync(FILE, JSON.stringify(d, null, 2) + '\n');

/* 입력 중 화면에 찍히지 않도록 출력 스트림을 잠깐 막는다 */
function askHidden(q) {
  return new Promise((resolve) => {
    const muted = new Writable({
      write(chunk, encoding, cb) { if (!muted.mute) process.stdout.write(chunk, encoding); cb(); },
    });
    const rl = createInterface({ input: process.stdin, output: muted, terminal: true });
    process.stdout.write(q);
    muted.mute = true;
    rl.question('', (a) => { muted.mute = false; rl.close(); process.stdout.write('\n'); resolve(a); });
  });
}

async function readPassword() {
  const p1 = await askHidden('새 비밀번호(8자 이상): ');
  if (p1.length < 8) { console.error('8자 이상이어야 합니다.'); process.exit(1); }
  const p2 = await askHidden('한 번 더 입력:        ');
  if (p1 !== p2) { console.error('두 입력이 다릅니다.'); process.exit(1); }
  return p1;
}

const [, , cmd, ...args] = process.argv;
const db = load();
const idx = (id) => db.users.findIndex((u) => u.id === String(id || '').toLowerCase());

if (cmd === 'list') {
  if (!db.users.length) console.log('(계정 없음)');
  else {
    console.log('아이디'.padEnd(14) + '이름'.padEnd(18) + '역할'.padEnd(8) + '권한 탭');
    db.users.forEach((u) => console.log(
      u.id.padEnd(14) + String(u.name).padEnd(16) + String(u.role).padEnd(8) +
      (u.tabs === '*' ? '전체' : (u.tabs || []).join(',')) +
      (u.schoolDepts?.length ? '  [주일학교: ' + u.schoolDepts.join(',') + ']' : '')));
  }
} else if (cmd === 'add') {
  const [id, name, role = 'staff', tabs = ''] = args;
  if (!id || !name) { console.error('사용법: add <아이디> "<이름>" <admin|staff> [탭,탭]'); process.exit(1); }
  if (idx(id) >= 0) { console.error('이미 있는 아이디입니다.'); process.exit(1); }
  const { salt, hash } = await hashPassword(await readPassword());
  const tabList = role === 'admin' ? '*'
    : (tabs ? tabs.split(',').map((s) => s.trim()).filter((t) => ALL_TABS.includes(t)) : ['home']);
  db.users.push({ id: id.toLowerCase(), name, role, tabs: tabList, schoolDepts: [], youthDepts: [], salt, hash });
  save(db);
  console.log('추가됨: ' + name + '(' + id + ') · 권한 ' + (tabList === '*' ? '전체' : tabList.join(',')));
} else if (cmd === 'passwd') {
  const i = idx(args[0]);
  if (i < 0) { console.error('없는 아이디'); process.exit(1); }
  Object.assign(db.users[i], await hashPassword(await readPassword()));
  save(db); console.log('비밀번호 변경됨');
} else if (cmd === 'tabs') {
  const i = idx(args[0]);
  if (i < 0) { console.error('없는 아이디'); process.exit(1); }
  db.users[i].tabs = args[1] === '*' ? '*'
    : args[1].split(',').map((s) => s.trim()).filter((t) => ALL_TABS.includes(t));
  save(db); console.log('권한 변경됨: ' + args[1]);
} else if (cmd === 'school') {
  const i = idx(args[0]);
  if (i < 0) { console.error('없는 아이디'); process.exit(1); }
  db.users[i].schoolDepts = args[1] === '-' ? [] : args[1].split(',').map((s) => s.trim());
  save(db); console.log('주일학교 부서 제한: ' + (args[1] === '-' ? '해제' : args[1]));
} else if (cmd === 'rm') {
  const i = idx(args[0]);
  if (i < 0) { console.error('없는 아이디'); process.exit(1); }
  const [u] = db.users.splice(i, 1); save(db);
  console.log('삭제됨: ' + u.name + '(' + u.id + ')');
} else {
  console.log([
    '대시보드 계정 관리', '',
    '  node scripts/user.mjs list',
    '  node scripts/user.mjs add <아이디> "<이름>" <admin|staff> [탭,탭,…]',
    '  node scripts/user.mjs passwd <아이디>',
    '  node scripts/user.mjs tabs <아이디> <탭,탭,…|*>',
    '  node scripts/user.mjs school <아이디> <부서,부서,…|->',
    '  node scripts/user.mjs rm <아이디>', '',
    '사용 가능한 탭: ' + TAB_DEFS.map((t) => t.key + '(' + t.label + ')').join(' '),
  ].join('\n'));
}
