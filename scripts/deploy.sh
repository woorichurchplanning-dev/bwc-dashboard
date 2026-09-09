#!/usr/bin/env bash
# 로컬에서 배포할 때는 반드시 이 스크립트를 쓸 것.
#
# `vercel deploy` 를 그냥 실행하면 로컬의 public/data.json 이 그대로 올라가
# 서버의 최신 데이터를 오래된 사본으로 덮어쓴다. data.json 은 깃에 없으므로
# 내 작업 폴더의 파일은 마지막으로 내려받은 시점에 멈춰 있다.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${SKIP_REFRESH:-}" != "1" ]; then
  echo "▸ 최신 데이터 수집 중… (30~60초)"
  bash scripts/refresh-data.sh
fi

test -s public/data.json || { echo "data.json 이 비어 있음 — 배포 중단"; exit 1; }
node -e "const d=require('./public/data.json'); if(!d.weekCount) throw new Error('weekCount 없음');
  console.log('▸ 배포할 데이터: '+d.weekCount+'주 · '+d.weekRange.join(' ~ '))"

# 화면이 실제로 읽는 것은 Blob 이다. 배포만 하면 오래된 Blob 이 그대로 남아
# 아무도 새 데이터를 못 본다. 그래서 Blob 에도 같이 올린다.
if [ ! -f .env.local ]; then
  vercel env pull .env.local --environment=production --yes >/dev/null
  PULLED=1
fi
node scripts/push-data.mjs
[ "${PULLED:-}" = 1 ] && rm -f .env.local

vercel deploy --prod --yes
