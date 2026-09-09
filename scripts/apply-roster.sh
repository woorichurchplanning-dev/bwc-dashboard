#!/usr/bin/env bash
# 권한 체크표(xlsx)를 대시보드 계정에 반영한다.
#   bash scripts/apply-roster.sh "~/Downloads/대시보드 계정 권한표.xlsx"          # 미리보기
#   bash scripts/apply-roster.sh "~/Downloads/대시보드 계정 권한표.xlsx" --apply  # 반영
set -euo pipefail
cd "$(dirname "$0")/.."
XLSX="${1:?권한 체크표 xlsx 경로를 넣어 주세요}"
shift || true

python3 scripts/xlsx-to-roster.py "$XLSX" scripts/roster.csv

# 저장소 접근 정보 (없으면 받아 온다)
if [ ! -f .env.local ]; then
  echo "▸ 저장소 접근 정보 받는 중…"
  vercel env pull .env.local --environment=production --yes >/dev/null
  PULLED=1
fi

node scripts/bulk-users.mjs scripts/roster.csv "$@"

[ "${PULLED:-}" = 1 ] && rm -f .env.local
exit 0
