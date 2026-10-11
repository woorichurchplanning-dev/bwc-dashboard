# 분당우리교회 사역 데이터 대시보드

교역자가 출석 현황을 보는 화면. 로그인해야 열리고, 담당 부서만 보인다.
운영 주소 — https://bwc-dashboard.vercel.app

운영 방법·계정 규칙은 `README.md` 에 있다. 이 파일은 **고칠 때 알아야 할 것**만 적는다.

## 구조

- `public/index.html` — 화면 전부(약 5,700줄). 빌드 없음
- `api/` — Vercel 서버리스 함수. `login` `me` `data` `sheet`(Apps Script 중계) `ingest`
- `lib/users.js` — 권한의 정의. 탭·교구·부서·팀 단위
- `middleware.js` — 로그인 안 하면 아무것도 못 보게 막는 자리
- `scripts/` — 계정·자료 관리 도구
- 계정과 출석 자료는 레포가 아니라 **Vercel Blob** 에 암호화되어 있다

## 고친 뒤 확인

```bash
npm run preview        # http://localhost:4321 · 로그인·자료를 흉내 낸다
```

`scripts/preview.mjs` 가 `/api/me` 와 `/api/data` 를 대신 답해 준다. 비밀값이 필요 없다.
`public/data.json` 이 있으면 그 진짜 자료를, 없으면 지어낸 20주를 쓴다.
**`/api/me` 는 평평한 객체**(`{id,name,admin,tabs,…}`)다 — `{user:…}` 로 감싸면
탭이 주간현황 하나만 보인다.

## ⚠️ 배포 — 반드시 이 스크립트로

```bash
SKIP_REFRESH=1 bash scripts/deploy.sh      # 코드만 고쳤을 때 (대부분)
bash scripts/deploy.sh                     # 자료까지 새로 수집해 올릴 때
```

**`vercel deploy` 를 직접 치지 말 것.** 내 작업 폴더의 `public/data.json` 은 마지막으로
내려받은 시점에 멈춰 있어서, 그걸 올리면 그 사이 들어온 입력이 **지워진다.**
실제로 두 번 겪었다. `SKIP_REFRESH=1` 은 Blob 을 아예 건드리지 않는다.

## 자료가 들어오는 길

```
입력앱 → 구글시트 → Apps Script → ① GitHub Action(15분마다) → /api/ingest → Blob
                                  ② 대시보드가 열릴 때 최근 2주를 직접 다시 읽음
```

`LIVE_REFRESH_WEEKS = 2` 가 ②다. 화면을 열면 최근 2주는 그 자리에서 다시 받는다.
그래서 방금 넣은 것도 대개 바로 보인다.

## 걸려 넘어지기 쉬운 것

**`chart.umd.min.js` 에 `defer` 를 붙이지 말 것.** 그리는 코드가 인라인이라 파싱 중에
`Chart` 를 쓴다. `defer` 를 붙이면 "Chart is not defined" 로 화면이 통째로 빈다.

**`TABS` 배열은 화면 위 탭 순서와 **자리 번호로** 짝이 맞는다.** 탭을 더하거나 옮기면
`TABS` 와 nav 의 DOM 순서를 같이 고쳐야 한다. 안 그러면 엉뚱한 탭이 열린다.

**권한은 `grantsOf()` 하나로 모인다.** '주간현황'을 자동으로 끼워 넣지 않는다 — 부서
담당자에게 교회 전체 숫자가 열리면 안 된다.

**시트 시각은 1899-12-30 기준 일련번호**로 올 수 있다. `toHM()` 이 변환한다.
(서울은 1908년 이전 지방시라 로캘 변환을 쓰면 어긋난다.)

**확인은 Playwright 로, 평범한 크롬 UA 로.** HeadlessChrome UA 는 `middleware.js` 가
막는다(AI 크롤러 차단). `/api/me` 와 `/api/data` 를 흉내 내면 로그인 없이 화면을 볼 수 있다.

## 이 레포는 공개(public)다

`public/data.json`(출석 자료), `scripts/roster.csv`(교역자 명단·초기 비밀번호), `.env*` 는
`.gitignore` 에 있다. **풀지 말 것.** 비밀값은 Vercel 환경변수와 GitHub Action 시크릿에 있다.

## 함께 봐야 할 두 곳

| | 무엇 | 어디 |
|---|---|---|
| 입력앱 | 교역자가 넣는 화면 | `bwc-input` · GitHub Pages |
| Apps Script | 시트를 읽고 쓰는 중간층 | `bwc-gas` · clasp |

입력 항목을 더하거나 이름을 바꾸면 **세 곳을 같이** 고쳐야 한다.
주차 규칙은 셋이 같다 — 그 한 주가 **끝나는 주일**.

## 주간 데이터 보고 메일

`admin.html` 의 '주간 데이터 보고 메일' 칸 → `api/report.js`(관리자만) → Apps Script
(`mode=report-settings` / `report-settings-save` / `report` / `report-send`).
설정은 교회 시트 「보고설정」 탭, 메일은 교회 계정이 보낸다. 본문은 `bwc-gas/src/WeeklyReport.js`.

## 미입력 알림 메일

`admin.html` 의 '미입력 알림' 탭 → `api/reminder.js`(관리자만) → Apps Script `mode=reminder-*`.
항목별 담당 이메일(칸을 벗어나면 저장), 요일·시각(기본 화 16시), 미리보기, 지금 보내기.
본문·발송은 `bwc-gas/src/InputReminder.js`.
