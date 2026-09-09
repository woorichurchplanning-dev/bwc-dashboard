#!/usr/bin/env node
/* 수집한 data.json 을 Blob 저장소로 올린다.
   GitHub Action이 배포(vercel deploy) 대신 이걸 쓴다 — 배포 토큰에 기대지 않으려고. */
import { readFileSync } from 'node:fs';
const snap = JSON.parse(readFileSync(new URL('../public/data.json', import.meta.url), 'utf8'));
if (!snap.weekCount) { console.error('data.json 형식 오류'); process.exit(1); }
const { saveWeekData, canUseBlob } = await import('../lib/datastore.js');
if (!canUseBlob()) { console.error('BLOB_READ_WRITE_TOKEN / STORE_KEY 가 없습니다'); process.exit(1); }
await saveWeekData(snap);
console.log(`올림: ${snap.weekCount}주 · ${snap.weekRange.join(' ~ ')} · ${snap.generatedAt}`);
