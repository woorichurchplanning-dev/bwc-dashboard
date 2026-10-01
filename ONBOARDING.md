# 같이 관리하기 — 처음 한 번 설정

분당우리교회 출석 데이터는 **세 덩어리**로 나뉘어 있다. 셋 다 받아야 제대로 고칠 수 있다.

| | 무엇을 하나 | 어디에 올라가나 |
|---|---|---|
| `bwc-input` | 교역자가 숫자를 넣는 화면 | GitHub Pages |
| `bwc-gas` | 구글시트를 읽고 쓰는 중간층 | Apps Script (clasp) |
| `bwc-dashboard` | 보는 화면 (이 레포) | Vercel |

입력 항목을 하나 더하는 일도 보통 **세 곳을 다 건드린다.**

---

## 1. 받아야 할 권한 (기존 담당자가 열어 준다)

- [ ] **GitHub** — 세 레포의 쓰기 권한 (Settings → Collaborators)
- [ ] **구글 스프레드시트** — `bwc_data_input` · 「교구 출석 현황표」 편집 권한
- [ ] **Apps Script 프로젝트** — 편집 권한 (스프레드시트 권한과 별개다)
- [ ] **입력앱 관리자 비밀번호** — 「데이터 현황」 탭용. 아이디는 `admin`
- [ ] **대시보드 계정** — 관리자 권한으로 하나

Vercel 계정은 **필요 없다.** `main` 에 push 하면 GitHub Action 이 알아서 배포한다.

---

## 2. 내 컴퓨터에 준비하기

```bash
# Node 22 이상
node -v

# Claude Code
npm install -g @anthropic-ai/claude-code

# 세 레포 받기
git clone https://github.com/woorichurchplanning-dev/bwc-dashboard.git
git clone https://github.com/barnabas4409-tech/bwc-input.git
git clone https://github.com/barnabas4409-tech/bwc-gas.git

# Apps Script 를 고치려면
npm install -g @google/clasp
clasp login          # 권한 받은 구글 계정으로
```

레포마다 `CLAUDE.md` 가 들어 있다. Claude Code 를 그 폴더에서 열면 자동으로 읽는다.
**무엇을 조심해야 하는지 거기 적어 뒀으니 먼저 읽어 볼 것.**

---

## 3. 고치고 올리기

### 입력앱 (`bwc-input`)

`index.html` 하나다. 고쳐서 push 하면 1~2분 뒤 반영된다.

### 대시보드 (`bwc-dashboard`)

`public/index.html` 과 `api/`.

**먼저 내 컴퓨터에서 확인한다.** 56명이 보는 화면이라 깨진 채로 올리면 바로 티가 난다.

```bash
npm run preview        # http://localhost:4321
```

로그인과 자료를 흉내 내 주므로 Vercel 계정도 비밀값도 필요 없다.
보이는 숫자는 **지어낸 것**이고 모양과 동작만 본다. 고치고 새로고침하면 바로 반영된다.

괜찮으면 push 한다. GitHub Action 이 배포한다 (2~3분).
진행 상황은 레포의 **Actions** 탭에서 본다.

> 크게 고칠 때는 `main` 에 바로 올리지 말고 브랜치에 올린 뒤 합치는 편이 안전하다.
> ```bash
> git switch -c 고칠것
> git push -u origin 고칠것      # 운영은 안 건드린다
> ```

> 로컬에서 `vercel deploy` 를 직접 치지 말 것. 내 폴더의 `public/data.json` 이
> 낡아서, 그걸 올리면 그 사이 들어온 입력이 **지워진다.** 실제로 두 번 겪었다.

### Apps Script (`bwc-gas`)

**`clasp push` 만으로는 안 바뀐다.** 배포까지 해야 운영 주소에 반영된다.

```bash
npx clasp push -f
npx clasp deploy -i AKfycbxJ1NDZxTpDsaVkb7GqlesBvlM_9lBBv2s4f53chZdqbHVnLZqOfVT1qzXVfsXW7qxA -d "무엇을 바꿨는지"
```

고친 뒤 GitHub 에도 commit·push 해서 둘이 서로 다른 코드를 보지 않게 할 것.

---

## 4. 서로 밟지 않기

- **같은 파일을 동시에 고치지 말 것.** 둘 다 `index.html` 한 덩어리라 충돌이 잦다.
  시작하기 전에 `git pull` 하고, 무엇을 건드릴지 한마디 나누는 편이 빠르다.
- **Apps Script 가 특히 위험하다.** `clasp push` 는 상대가 편집기에서 고친 것을
  통째로 덮어쓴다. 고치기 전에 `clasp pull` 로 맞춰 볼 것.
- 비밀값(조회 키·관리자 비밀번호·토큰)은 **공개 레포에 쓰지 말 것.**
  `bwc-input` 과 `bwc-dashboard` 는 공개다.

---

## 5. 자주 쓰는 명령

```bash
# 대시보드 계정
node scripts/user.mjs list
node scripts/user.mjs add 홍길동 "홍길동 목사" staff home,school

# Apps Script 가 살아 있나
curl -sL "https://script.google.com/macros/s/AKfycbxJ1NDZxTpDsaVkb7GqlesBvlM_9lBBv2s4f53chZdqbHVnLZqOfVT1qzXVfsXW7qxA/exec?mode=size"
```

운영·계정 규칙은 `README.md`, 코드를 고칠 때 조심할 것은 `CLAUDE.md` 에 있다.
