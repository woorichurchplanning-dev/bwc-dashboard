#!/usr/bin/env bash
# data.json 생성기: Apps Script를 12주씩 병렬 조회해 전체 스냅샷을 만든다.
# 로컬 수동 실행: bash scripts/refresh-data.sh
# GitHub Action에서도 동일하게 호출.
set -euo pipefail

URL="${APPS_SCRIPT_URL:-https://script.google.com/macros/s/AKfycbxJ1NDZxTpDsaVkb7GqlesBvlM_9lBBv2s4f53chZdqbHVnLZqOfVT1qzXVfsXW7qxA/exec}"
WEEKS_BACK="${WEEKS_BACK:-130}"

cd "$(dirname "$0")/.."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 1) 오늘 기준으로 과거 N주 일요일을 <=12주 배치로 분할
WEEKS_BACK="$WEEKS_BACK" node -e '
const wb = Number(process.env.WEEKS_BACK || 130);
const t = new Date(); const b = new Date(t); b.setDate(t.getDate() - t.getDay());
const w = [];
for (let i = 0; i < wb; i++) { const d = new Date(b); d.setDate(b.getDate() - i * 7); w.push(d.toISOString().split("T")[0]); }
const batches = []; for (let i = 0; i < w.length; i += 12) batches.push(w.slice(i, i + 12));
batches.forEach((x, i) => console.log(i + " " + x.join(",")));
' > "$TMP/batches.txt"

echo "fetching in $(wc -l < "$TMP/batches.txt") parallel batches (each ~30-40s)..." >&2

# 2) 배치 병렬 조회 (Apps Script는 302 리다이렉트 → curl -L 필요, 요청당 최대 12주)
while read -r idx keys; do
  curl -sL "$URL?weekKeys=$keys" -o "$TMP/b$idx.json" &
done < "$TMP/batches.txt"
wait

# 3) 병합 → data.json (빈 주차 제외, 최신순 정렬 메타 포함)
node -e '
const fs = require("fs");
const dir = process.argv[1];
const data = {};
for (const f of fs.readdirSync(dir).filter((f) => /^b\d+\.json$/.test(f))) {
  let j; try { j = JSON.parse(fs.readFileSync(dir + "/" + f, "utf8")); } catch { continue; }
  if (!j || !j.success || !j.data) continue;
  for (const [k, v] of Object.entries(j.data)) if (v && Object.keys(v).length > 0) data[k] = v;
}
const keys = Object.keys(data).sort();
if (!keys.length) { console.error("no data fetched; aborting (data.json 유지)"); process.exit(1); }
const out = { generatedAt: new Date().toISOString(), weekRange: [keys[0], keys[keys.length - 1]], weekCount: keys.length, data };
fs.writeFileSync("data.json", JSON.stringify(out));
console.error("wrote data.json: " + keys.length + " weeks, " + keys[0] + " -> " + keys[keys.length - 1]);
' "$TMP"
