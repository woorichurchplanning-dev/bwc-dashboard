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
const { saveWeekData, canUseBlob } = await import('../lib/datastore.js');
if (!canUseBlob()) { console.error('BLOB_READ_WRITE_TOKEN / STORE_KEY 가 없습니다'); process.exit(1); }
await saveWeekData(snap);
console.log(`올림: ${snap.weekCount}주 · ${snap.weekRange.join(' ~ ')} · ${snap.generatedAt}`);
