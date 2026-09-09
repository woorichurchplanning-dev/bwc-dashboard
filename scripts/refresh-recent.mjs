#!/usr/bin/env node
/* 최근 몇 주만 시트에서 받아 대시보드에 얹는다.

   전체 스냅샷(refresh-data.sh)은 130주를 훑느라 Apps Script 실행시간을 8분쯤
   쓴다. 그걸 두 시간마다 돌리면 Apps Script 하루 할당량(90분)을 넘겨 연동이
   통째로 멈춘다. 그래서 자주 도는 쪽은 최근 몇 주만 가져와 /api/ingest 로
   합치고, 전체는 하루 한 번만 다시 만든다.

     node scripts/refresh-recent.mjs [주수]
   필요한 환경변수: INGEST_SECRET, SHEET_READ_KEY */
const WEEKS = Number(process.argv[2] || 4);
const URL_ = process.env.INGEST_URL || 'https://bwc-dashboard.vercel.app/api/ingest';
const SECRET = process.env.INGEST_SECRET || '';
const GAS = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbxJ1NDZxTpDsaVkb7GqlesBvlM_9lBBv2s4f53chZdqbHVnLZqOfVT1qzXVfsXW7qxA/exec';

if (!SECRET) { console.error('INGEST_SECRET 이 없습니다'); process.exit(1); }

// 오늘이 속한 주의 일요일부터 거슬러 올라간다
const base = new Date();
base.setDate(base.getDate() - base.getDay());
const weeks = [];
for (let i = 0; i < WEEKS; i++) {
  const d = new Date(base); d.setDate(base.getDate() - i * 7);
  weeks.push([d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'),
              String(d.getDate()).padStart(2, '0')].join('-'));
}

const READ_KEY = process.env.SHEET_READ_KEY || '';
const res = await fetch(`${GAS}?weekKeys=${weeks.join(',')}` +
  (READ_KEY ? `&key=${encodeURIComponent(READ_KEY)}` : ''), { redirect: 'follow' });
if (!res.ok) { console.error(`Apps Script HTTP ${res.status}`); process.exit(1); }
const raw = await res.json();
if (!raw?.success || !raw.data) { console.error('Apps Script 응답 오류:', raw?.error || '형식 오류'); process.exit(1); }

const data = Object.fromEntries(
  Object.entries(raw.data).filter(([, v]) => v && Object.keys(v).length > 0));
if (!Object.keys(data).length) { console.log('바뀐 주차 없음'); process.exit(0); }

const put = await fetch(URL_, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-ingest-secret': SECRET },
  body: JSON.stringify({ data }),
});
const out = await put.json().catch(() => ({}));
if (!put.ok) { console.error(`ingest HTTP ${put.status}`, out); process.exit(1); }
console.log('반영:', (out.changed || []).join(', ') || '없음');
