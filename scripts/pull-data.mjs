#!/usr/bin/env node
/* Blob 저장소의 최신 스냅샷을 public/data.json 으로 내려받는다.

   GitHub Action 이 배포하기 직전에 쓴다. data.json 은 .gitignore 에 있어
   체크아웃에는 없는데, api/data.js 가 이 파일을 번들에 포함시키기 때문이다.
   내 노트북의 낡은 사본을 올리는 대신 저장소의 지금 것을 받아 간다. */
import { writeFileSync, readFileSync } from 'node:fs';

try {
  for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
    const i = line.indexOf('=');
    if (i > 0 && !line.startsWith('#')) {
      const k = line.slice(0, i).trim();
      if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^"|"$/g, '');
    }
  }
} catch { /* 없으면 환경변수를 그대로 쓴다 */ }

const { loadWeekData, canUseBlob } = await import('../lib/datastore.js');
if (!canUseBlob()) { console.error('BLOB_READ_WRITE_TOKEN / STORE_KEY 가 없습니다'); process.exit(1); }

const snap = await loadWeekData({ fresh: true });
if (!snap?.weekCount) { console.error('저장소에 쓸 만한 스냅샷이 없습니다'); process.exit(1); }

writeFileSync(new URL('../public/data.json', import.meta.url), JSON.stringify(snap));
console.log(`▸ 내려받음: ${snap.weekCount}주 · ${snap.weekRange.join(' ~ ')}`);
