#!/usr/bin/env node
/* 수집한 data.json 을 Blob 저장소로 올린다.
   GitHub Action이 배포(vercel deploy) 대신 이걸 쓴다 — 배포 토큰에 기대지 않으려고. */
import { readFileSync } from 'node:fs';

// 로컬에서 돌릴 때는 .env.local 이 있으면 그걸 쓴다 (Action 에서는 환경변수로 들어온다)
try {
  for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
    const i = line.indexOf('=');
    if (i > 0 && !line.startsWith('#')) {
      const k = line.slice(0, i).trim();
      if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^"|"$/g, '');
    }
  }
} catch { /* 없으면 환경변수를 그대로 쓴다 */ }

const snap = JSON.parse(readFileSync(new URL('../public/data.json', import.meta.url), 'utf8'));
if (!snap.weekCount) { console.error('data.json 형식 오류'); process.exit(1); }
const { saveWeekData, loadWeekData, canUseBlob } = await import('../lib/datastore.js');
if (!canUseBlob()) { console.error('BLOB_READ_WRITE_TOKEN / STORE_KEY 가 없습니다'); process.exit(1); }

/* 이미 올라가 있는 것이 더 새것이면 덮지 않는다.

   시트에 새로 들어온 값은 /api/ingest 로 바로 얹힌다. 그런데 내 작업 폴더의
   data.json 은 마지막으로 내려받은 시점에 멈춰 있어서, 코드만 고쳐 배포해도
   그 낡은 사본이 최신 자료를 지워 버렸다. 실제로 새가족 7~9월 입력분이
   그렇게 사라졌다. --force 를 붙이면 그래도 올린다. */
const force = process.argv.includes('--force');
const stored = await loadWeekData({ fresh: true }).catch(() => null);
if (!force && stored?.generatedAt && Date.parse(stored.generatedAt) > Date.parse(snap.generatedAt)) {
  console.log(`건너뜀 — 올라가 있는 쪽이 더 새것입니다 (${stored.generatedAt} > ${snap.generatedAt}).`);
  console.log('덮어쓰려면 --force, 최신을 받으려면 bash scripts/refresh-data.sh');
  process.exit(0);
}
await saveWeekData(snap);
console.log(`올림: ${snap.weekCount}주 · ${snap.weekRange.join(' ~ ')} · ${snap.generatedAt}`);
