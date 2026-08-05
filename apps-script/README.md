# 시트 수정 → 대시보드 즉시 자동 갱신 설정

시트를 편집하면 약 1~2분 내에 `data.json`이 자동 갱신되고 GitHub Pages가 재배포됩니다. 새로고침 버튼을 누를 필요가 없어집니다.

동작 흐름:
```
시트 편집 → Apps Script onEdit(90초 debounce) → GitHub repository_dispatch
        → refresh-data.yml 워크플로 실행 → data.json 재생성·커밋 → Pages 재배포
```

## 준비: 저장소 Actions 쓰기 권한 (1회)

GitHub 저장소 → **Settings → Actions → General → Workflow permissions** →
**"Read and write permissions"** 선택 후 저장. (워크플로가 `data.json`을 커밋하려면 필요)

## 1) GitHub 토큰 만들기

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
2. **Repository access**: Only select repositories → `woorichurchplanning-dev/bwc-dashboard`
3. **Permissions → Repository permissions → Contents: Read and write** (이거 하나면 dispatch 가능)
4. 만료일은 넉넉히(예: 1년). 생성 후 나오는 `github_pat_...` 토큰을 복사.

## 2) Apps Script에 코드 추가

1. 시트의 Apps Script 프로젝트 열기 (또는 기존 `/exec` 스크립트 프로젝트).
2. `notify-github.gs` 내용을 새 파일로 붙여넣기.
3. **프로젝트 설정(⚙️) → 스크립트 속성 → 속성 추가**:
   - 이름: `GH_TOKEN`
   - 값: 위에서 복사한 토큰
4. (스탠드얼론 스크립트라 시트와 분리돼 있으면) `notify-github.gs`의 `SHEET_ID`에 스프레드시트 ID를 채우기. 시트에 바인딩된 스크립트면 비워둬도 됨.

## 3) 트리거 설치 (1회)

Apps Script 편집기에서 함수 목록에서 **`installTriggers`** 선택 → **실행**.
처음 실행 시 권한 승인 창이 뜨면 허용. → 설치형 onEdit 트리거가 생깁니다.

## 4) 연결 테스트

함수 목록에서 **`testDispatch`** → **실행**. 몇 초 뒤 GitHub 저장소 **Actions** 탭에
"Refresh dashboard data" 실행이 뜨면 성공. 1~2분 후 대시보드에 최신 데이터 반영.

---

### 참고
- 편집 버스트는 90초 debounce로 합쳐져 워크플로가 과도하게 돌지 않습니다.
- 자동 트리거가 실패해도 매일 예약(cron)과 대시보드의 "새로고침" 버튼이 백업으로 남아 있습니다.
- 토큰을 코드에 직접 넣지 말고 반드시 **스크립트 속성**에 보관하세요.
