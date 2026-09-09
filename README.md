# 분당우리교회 사역 데이터 대시보드

주일예배 · 주일학교 · 청년교구 · 주중예배 · 새가족 · 특별예배 출석 현황을 보는
내부용 대시보드. 로그인한 교역자만 접근할 수 있고, 담당 부서만 보이도록 권한을 나눈다.

**운영 주소** — https://bwc-dashboard.vercel.app

---

## 계정 관리

### 처음 한 번 (관리자 계정 만들기)

`/setup.html` 에서 설정 코드를 넣고 첫 관리자를 만든다.
계정이 하나라도 생기면 이 화면은 **영구히 닫힌다.**
설정 코드는 Vercel 환경변수 `BOOTSTRAP_CODE` 에 있다.

### 교역자 계정 추가 (평소)

관리자로 로그인 → 헤더의 **계정 관리** → 아래 규칙으로 입력한다.

| 항목 | 규칙 | 예 |
|---|---|---|
| 아이디 | 교역자 이름. 한글·영문소문자·숫자 2~20자, **공백 불가** | `김철수` |
| 이름 | 화면에 표시될 이름 | `김철수 목사` |
| 초기 비밀번호 | 4자 이상. 전화번호 뒷자리 등 | `8412` |
| 권한 탭 | 볼 수 있는 탭. 주간현황은 항상 공통 | 주일학교 |
| 주일학교 담당 부서 | 비워 두면 전체 | 중등부, 고등부 |

**초기 비밀번호는 본인이 첫 로그인에서 반드시 바꾼다.** 바꾸기 전까지 대시보드도
API도 열리지 않는다. 목록에 `초기 비밀번호` 배지가 남아 있으면 아직 안 바꾼 것이다.

> 전화번호 뒷자리는 동료도 짐작할 수 있어 그대로 두면 부서 분리가 무의미해진다.
> 그래서 초기 발급용으로만 쓰고 본인 비밀번호로 바꾸게 되어 있다.

### 터미널로 관리 (대안)

```bash
node scripts/user.mjs list
node scripts/user.mjs add 김철수 "김철수 목사" staff home,school
node scripts/user.mjs school 김철수 중등부,고등부
node scripts/user.mjs tabs 김철수 home,school,youth
node scripts/user.mjs passwd 김철수      # 초기 비밀번호로 재설정
```

`users.json` 은 **씨앗 파일일 뿐** 운영 계정은 여기에 없다. 실제 계정은 암호화된
Blob 저장소에 있고 관리자 화면이 그것을 수정한다.

---

## 데이터가 들어오는 경로

```
구글 시트 ──(Apps Script doGet)──> GitHub Action ──> public/data.json ──> Vercel 배포
                                    매일 KST 05:00
                                    월 KST 13:00
                                    시트 수정 시 즉시(repository_dispatch)
```

- **data.json은 레포에 커밋하지 않는다.** 레포가 public이라 커밋하면 출석 데이터가
  `raw.githubusercontent.com` 으로 그대로 공개된다. Action이 만들어 바로 배포한다.
- `.vercelignore` 가 없으면 Vercel이 `.gitignore` 를 따라가 data.json이 배포에서
  빠지고 대시보드가 빈다. 두 파일을 함께 관리할 것.
- 배포 전 `Sanity check` 단계가 파일이 비었는지 확인해 빈 데이터 배포를 막는다.

### 시트에 없어서 비어 있는 화면

코드 문제가 아니라 시트에 항목이 없어서 비는 것들:

- 리더십(순장반), 소그룹(다락방)
- 새가족 `청년` 탭 — 시트에 `장년 새가족` 만 들어온다
- 특별예배 — 아래 형식으로 항목을 만들면 자동으로 표시된다

```
특별예배 > {집회명} > {일자}|{부}|{장소}|{호실}

  월|1부|송림|본당1층      → 특별새벽부흥회·고난주간 (일자별)
  |1부|송림|본당1층        → 성탄·송구영신 (일자 없음)
  |2부|서현|305호
```

호실명의 공백은 자동으로 지워 합쳐진다(`본당 4층` = `본당4층`).
부가 없는 해는 컬럼을 비우면 된다.

---

## 배포

```bash
bash scripts/deploy.sh          # 로컬에서 수동 배포 (데이터 먼저 갱신)
```

> `vercel deploy` 를 직접 쓰지 말 것. data.json 은 깃에 없어서 내 작업 폴더의
> 사본이 오래된 상태이고, 그대로 올리면 서버의 최신 데이터를 덮어쓴다.
> `scripts/deploy.sh` 는 배포 전에 시트에서 데이터를 다시 받아 온다.

Vercel ↔ GitHub 자동 연동은 **안 되어 있다.** Vercel 앱이
`woorichurchplanning-dev` 조직에 설치되어 있지 않아서다. 대신 GitHub Action이
`VERCEL_TOKEN` 으로 직접 배포한다. 나중에 Vercel 대시보드에서 레포를 연결하면
워크플로의 `Deploy to Vercel` 단계는 지워도 된다.

### 환경변수 (Vercel)

| 이름 | 용도 |
|---|---|
| `SESSION_SECRET` | 세션 쿠키 HMAC 서명 키 |
| `STORE_KEY` | 계정 저장소 AES-256-GCM 암호화 키 |
| `BLOB_READ_WRITE_TOKEN` | 계정 저장소(Blob) 접근. 이 스토어 하나에만 유효 |
| `BOOTSTRAP_CODE` | 최초 관리자 생성 코드 |

### GitHub Secrets

`VERCEL_TOKEN` · `VERCEL_ORG_ID` · `VERCEL_PROJECT_ID`

> `VERCEL_TOKEN` 은 현재 개인 계정 토큰이다. 이 프로젝트 전용 토큰으로 교체하는 편이 안전하다.

---

## 보안 설계

- 비밀번호는 **PBKDF2-SHA256 21만 회** 해시로만 저장. 평문은 어디에도 없다.
- 세션은 HMAC 서명 쿠키 — HttpOnly · Secure · SameSite=Lax · 12시간.
- 없는 아이디도 더미 해시를 검증해 응답 시간을 맞춘다(계정 존재 여부 비노출).
- IP당 10분 8회 로그인 시도 제한.
- 계정 저장소는 AES-256-GCM 암호문. Blob URL이 새더라도 내용은 읽을 수 없다.
- 미들웨어가 `login/setup/password` 와 아이콘을 뺀 **모든 경로**를 막는다.
  `users.json` · `lib/` · `api/` 는 정적 서빙 대상이 아니다.
- `/admin.html` 과 `/api/users` 는 관리자 세션만 통과한다.
- 서비스워커는 데이터를 캐시하지 않는다. 로그아웃 시 캐시·등록을 정리한다.

### 알려진 제약

- **레포가 public이다.** 조직 소유자만 비공개로 바꿀 수 있다. 새 데이터는 더 이상
  레포에 들어가지 않지만, 과거 커밋 히스토리에는 남아 있다.
- 권한을 바꿔도 그 사람의 기존 세션에는 최대 12시간까지 옛 권한이 남는다.
  즉시 반영하려면 다시 로그인하게 한다.

---

## 구조

```
public/          로그인 뒤에서만 열리는 정적 파일 (index.html, data.json, admin.html …)
api/             login · logout · me · password · users · bootstrap
lib/             auth.js(해시·세션) · users.js(권한) · store.js(암호화 저장소)
middleware.js    전 경로 접근 제어
scripts/         refresh-data.sh(데이터 수집) · user.mjs(계정 CLI)
users.json       씨앗 파일. 운영 계정은 여기 없다
```
