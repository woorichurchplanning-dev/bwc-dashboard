#!/usr/bin/env node
/* 고친 대시보드를 올리기 전에 내 컴퓨터에서 확인한다.

     node scripts/preview.mjs        → http://localhost:4321

   로그인(/api/me)과 자료(/api/data)를 흉내 내 준다. 그래서 Vercel 계정도,
   비밀값도 필요 없다. 보이는 숫자는 **지어낸 것**이다 — 모양과 동작만 본다.

   진짜 자료로 보려면 public/data.json 을 갖다 두면 그걸 쓴다
   (`node scripts/pull-data.mjs`, 단 저장소 토큰이 있어야 한다).

   고치고 새로고침하면 바로 반영된다. 껐다 켤 필요 없다. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../public/', import.meta.url));
const PORT = Number(process.env.PORT) || 4321;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

/* 모든 탭·모든 교구가 보이는 관리자. 권한 화면을 확인하려면
   tabs 를 ['home','school'] 처럼 줄여 보면 된다. */
// /api/me 와 같은 모양이어야 한다 (평평한 객체. { user: … } 로 감싸면 안 된다)
const ME = {
  id: 'preview', name: '미리보기', admin: true,
  tabs: ['home','district','youth','school','sunday','wd','newfam','special','yearcomp'],
  schoolDepts: null, youthDepts: null, youthTeams: null, districts: null,
  mustChangePassword: false,
  expiresAt: Date.now() + 86400000,
};

/* 지어낸 자료. 주마다 조금씩 흔들리게 만들어 그래프가 밋밋하지 않게 한다. */
function fakeData(weeks = 20) {
  const out = {};
  const base = new Date();
  base.setDate(base.getDate() - base.getDay());          // 이번 주 주일
  const wobble = (n, i, amp = 0.06) => Math.round(n * (1 + Math.sin(i * 1.1) * amp));

  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i * 7);
    const wk = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

    const bu = (p, seo, song) => ({ [`서현 ${p}`]: wobble(seo, i), [`송림 ${p}`]: wobble(song, i) });
    out[wk] = {
      '주일예배': {
        '서현': { '1부': wobble(330, i), '2부': wobble(1240, i), '3부': wobble(1180, i), '총계': wobble(2750, i) },
        '송림': { '1부': wobble(900, i), '2부': wobble(1700, i), '3부': wobble(1600, i), '총계': wobble(4200, i) },
      },
      '주중예배/새벽기도': {
        '수요예배': { '인원': wobble(420, i) },
        '금요기도회': { '인원': wobble(500, i) },
        '새벽기도': { '월': wobble(95, i), '화': wobble(88, i), '수': wobble(92, i),
                      '목': wobble(80, i), '금': wobble(84, i), '토': wobble(72, i) },
        '온라인예배': { '주일 1부': wobble(9500, i), '주일 2부': wobble(8700, i), '주일 3부': wobble(6100, i),
                        '주일 온라인': wobble(24300, i), '수요 온라인': wobble(4600, i), '금요 온라인': wobble(11000, i) },
      },
      '청년교구': {
        '청년금요집회': { '현장 인원': wobble(330, i), '온라인': wobble(60, i) },
        ...Object.fromEntries([1,2,3,4].map(n => [`${n}청년부 (예배)`, { '예배인원': wobble(380 - n*40, i) }])),
        ...Object.fromEntries([1,2,3,4].map(n => [`1청년부 ${n}팀`,
          { '팀모임 인원': wobble(110, i + n), '순모임 인원': wobble(104, i + n) }])),
      },
      '주일학교': Object.fromEntries(
        ['사랑부','영아부','유아부','유치부','송림유년부','서현유년부','송림초등부','서현초등부',
         '송림소년부','서현소년부','송림청소년부','서현중등부','서현고등부'].map((n, k) => [n, {
          '1부 학생': wobble(120 + k*6, i + k), '1부 교사': wobble(40, i + k),
          '1부 방문자': k % 4, '1부 등반자': k % 3, '1부 헌금': wobble(70000, i + k),
          '2부 학생': wobble(100 + k*5, i + k), '2부 교사': wobble(42, i + k),
          '2부 방문자': (k + 1) % 3, '2부 등반자': k % 2, '2부 헌금': wobble(35000, i + k),
        }])),
      '새가족': {
        '장년 새가족': { '등록 가능': wobble(9, i), '등록 불가능': wobble(3, i), '냉담기': 2,
                         '이사': 1, '짝믿음': 1, '기타(이단 등)': 1, '결혼(부부)': 0, '초신자': 2 },
        '장년등록자': Object.fromEntries(
          ['20대 이하','30대','40대','50대','60대','70대 이상'].flatMap((a, k) =>
            [[`${a} 남`, wobble(3 + k % 3, i + k)], [`${a} 여`, wobble(4 + k % 4, i + k)]])),
      },
      '교구 다락방': Object.fromEntries(
        Array.from({ length: 14 }, (_, k) => [`${k+1}교구`, {
          '여다락방': wobble(90, i + k), '여직장다락방': wobble(35, i + k), '남다락방': wobble(70, i + k),
          '부부다락방': wobble(45, i + k), '시니어': wobble(30, i + k),
        }])),
      ...bu, // (사용 안 함 — 모양 맞추기용)
    };
    delete out[wk][undefined];
  }
  return { generatedAt: new Date().toISOString(), weekCount: weeks,
           weekRange: [Object.keys(out)[0], Object.keys(out).slice(-1)[0]], data: out };
}

const REAL = join(ROOT, 'data.json');
const DATA = existsSync(REAL)
  ? JSON.parse(await readFile(REAL, 'utf8'))
  : fakeData();

const json = (res, body) => {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  if (p === '/api/me')     return json(res, ME);
  if (p === '/api/data')   return json(res, DATA);
  if (p === '/api/logout') return json(res, { ok: true });
  if (p === '/api/sheet')  return json(res, { success: false, error: '미리보기에서는 시트를 읽지 않습니다' });
  if (p.startsWith('/api/')) return json(res, { ok: true, preview: true });

  // public/ 안의 파일만 내보낸다 (../ 같은 경로는 막는다)
  const rel = normalize(p === '/' ? '/index.html' : p).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  try {
    await stat(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream',
                         'cache-control': 'no-store' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('없는 파일: ' + rel);
  }
}).listen(PORT, () => {
  console.log(`\n  미리보기 → http://localhost:${PORT}`);
  console.log(`  자료     → ${existsSync(REAL) ? '진짜 (public/data.json)' : '지어낸 것 (20주)'}`);
  console.log(`  로그인   → 건너뜀 · 모든 탭이 보입니다`);
  console.log(`\n  고치고 새로고침하면 바로 반영됩니다. 끝내려면 Ctrl+C\n`);
});
