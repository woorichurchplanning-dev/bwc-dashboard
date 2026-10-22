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
입력앱 → 구글시트 → Apps Script → ① GitHub Action(하루 한 번 KST 04:30 전체) → Blob
                                  ② 대시보드가 열릴 때 최근 2주를 직접 다시 읽음
```

①은 원래 15분마다 최근 3주를 /api/ingest 로 올렸다. 그게 Blob list·put을 한 달 8,600번쯤
해서 Hobby 한도를 넘겼고, 2026-10-14 Vercel 계정 전체(이 계정의 모든 사이트)가 30일
정지됐다. **Blob을 주기적으로 쓰는 일을 다시 늘리지 말 것.**

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
묶음별 마감(주일학교·청년교구 화 14시, 예배 수 12시, 새가족 목 13시 — 지나면 매시간 트리거가 한 번 보냄),
항목별 담당(이름이나 이메일, 칸을 벗어나면 저장), 메일 문구(제목·인사·요청·안내·맺음, {호칭}{기간}{주}{건수}),
시험 발송(담당자 몫을 다른 주소로, [테스트]), 미리보기, 지금 보내기.
본문·발송은 `bwc-gas/src/InputReminder.js`.

## 주일 행사 태그

주일예배 탭 주 선택 아래 '이 주일의 행사'에서 그 주일에 성찬식·새생명 축제 같은 태그와 메모를 단다
(주일예배 탭 권한 또는 관리자). `POST /api/sheet` → Apps Script `doPost`(묶음 `주일행사` · 항목 `주일`).
태그는 미리 정하지 않는다 — 처음 직접 쓴 이름이 Apps Script 목록(`?mode=event-tags`)에 남아 다음부터 버튼으로 뜬다.
특별예배/행사 탭에는 태그마다 하위 탭이 생긴다(`renderSpEvTabs`). 화면은 특새·성탄과 같은 모양(`renderSunEventsTab` — 연도 막대·연도별 요약·부별 비교·기록표), 한 해 여러 번이면 회 평균. 고친 주는 3일 동안 열 때마다
시트에서 다시 읽는다(`sunEvRecentEdits`) — 지난 주차는 하루 한 번 만드는 스냅샷에서 오기 때문.

## 주일학교 탭 · 기간 줄 · 엑셀

- 주일학교는 한 화면(`renderSchool`)에 상태 `SCH`(묶음·부서·부·보기·주). 기본 보기는 **학생**, '＋ 교사'·'교사만'으로 바꾼다
  (`schVal`). 2025-12-28 이전은 학생·교사 구분 없이 합계만 있어 학생 보기에서는 비어 보인다.
  위 카드는 고른 주(주일예배 탭처럼 주 선택), 그래프는 기간 줄, 주별 상세는 기간과 상관없이 한 달씩 더 연다.
- 기간 줄은 탭(열린 하위 탭)에 `.flt-slot` 이 있으면 그 자리로 옮겨진다(`placeFltBar`) — 위쪽 카드 바로 아래, 그래프 위.
  기간 줄 **위의 카드는 기간과 상관없다**(최근 8주 `KFW()` · 고른 주 · 새가족은 이번 주/올해 누계). 아래 그래프·표만 기간을 따른다.
  청년부 하위 탭처럼 그릴 때 통째로 다시 만드는 곳이 있어 `runInit` 이 그리기 전에 기간 줄을 빼 두었다가 돌려놓는다.
  'N주'·날짜 범위는 '직접 설정 ▾'에 접혀 있다.
- '⬇ 엑셀'은 라이브러리 없이 .xlsx 를 만든다(`xlsxBlob`). 고르는 창의 항목은 `exportOptions(tab)` —
  주일학교는 `schoolSheetOptions` — '부서별 비교' 한 시트 + 부서마다 시트 하나(주차 × 1·2부 학생·교사·합계·방문자·등반자).
  부서 목록은 자료에서 뽑는다(`schoolExportDepts`) — 새 부서가 생기면 시트도 는다. 다른 탭은 예전 CSV 내용(`tabExportRows`) 한 시트.
- 로그인: '아이디 저장'(localStorage `bwc-login-id`) · '로그인 유지'(7일, `SESSION_MAX_AGE_LONG`).
  권한은 세션에 담기므로 권한을 바꾸거나 계정을 지워도 다시 로그인하기 전까지(최대 7일) 예전 권한이 남는다.

## 꺾은선의 빈 주

`lds()` 는 `spanGaps:true` — 빈 주는 앞뒤를 이어 그린다. `mkChart` 가 `opts.fw` 가 있는 꺾은선이면 `gapLabels` 로
가운데 빈 주의 날짜 밑에 사유를 단다(`gapWhy`: 주중 휴회 사유 → 교구 휴회 `D.cellOff`/`D.leaderOff` → `WEEK_NOTES` → 없으면 '미입력').
교구 휴회는 입력앱 교구 표의 '이번 주 휴회'(각 교구 줄에 `휴회`=사유만, 숫자 없음) 또는 교구 시트의 `_휴강`.
주일예배(서현·송림)·주일학교·청년교구 줄의 `휴회` 는 `offOf()` 가 읽는다 — 사유가 있고 숫자가 0이면 그 줄을 세지 않고 `D.weekOff[주][이름]` 에 사유를 둔다.
숫자가 있으면 그대로 센다(사랑1부·2부가 '사랑부'로 합쳐질 때 한쪽만 쉰 경우).
선을 끊어야 하는 차트는 그 데이터셋에 `spanGaps:false` 를 직접 준다(연도 비교처럼).
