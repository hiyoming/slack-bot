# 🤖 Slack 봇 만들기 가이드 (Node.js + Express)

개발자가 아니더라도 따라 할 수 있도록 작성된 가이드입니다. 천천히 순서대로 진행해 주세요!

## 1. 사전 준비 (설치)

1. **Node.js 설치하기**: 컴퓨터에 Node.js가 설치되어 있어야 합니다. [Node.js 공식 홈페이지](https://nodejs.org/)에서 다운로드 후 설치해 주세요. (LTS 버전 추천)
2. **VS Code (코드 편집기) 설치하기**: 코드를 편하게 보고 수정하기 위해 [VS Code](https://code.visualstudio.com/)를 설치하는 것을 추천합니다.

---

## 2. 프로젝트 셋업 및 실행 준비

1. 현재 폴더(슬랙 봇 파일이 있는 폴더)를 VS Code로 엽니다.
2. VS Code 상단 메뉴에서 **[Terminal(터미널)] -> [New Terminal(새 터미널)]**을 클릭합니다.
3. 터미널 창에 아래 명령어를 복사해서 붙여넣고 `Enter(엔터)`를 누릅니다. (필요한 도구들을 설치하는 과정입니다)
   ```bash
   npm install
   ```

---

## 3. Slack App 생성 및 토큰 발급 받기

Slack에서 봇을 등록하고, 봇 전용 비밀번호(토큰)를 받아와야 합니다.

1. **[Slack API 페이지](https://api.slack.com/apps)** 에 접속하여 로그인합니다.
2. 우측 상단의 **[Create New App]** 버튼을 클릭합니다.
3. **[From scratch]**를 선택합니다.
4. App Name에 봇 이름(예: `My First Bot`)을 적고, 봇을 사용할 워크스페이스를 선택한 후 **[Create App]**을 클릭합니다.

### 🔑 비밀번호(Signing Secret) 확인하기
1. 왼쪽 메뉴에서 **[Basic Information]**을 클릭합니다.
2. 화면을 아래로 조금 내려서 **App Credentials** 섹션을 봅니다.
3. **Signing Secret** 항목 옆에 있는 `Show` 버튼을 누른 뒤 그 값을 복사해 둡니다.

### 🎟️ 권한 설정 및 토큰(Token) 발급하기
1. 왼쪽 메뉴에서 **[OAuth & Permissions]**를 클릭합니다.
2. 화면을 아래로 내려서 **Scopes** -> **Bot Token Scopes** 섹션을 찾습니다.
3. **[Add an OAuth Scope]** 버튼을 누르고 다음 두 가지 권한을 추가합니다:
   - `chat:write` (봇이 메시지를 보낼 수 있는 권한)
   - `channels:history` (봇이 공개 채널의 메시지를 읽을 수 있는 권한)
4. 권한을 추가했다면 화면 맨 위로 올라가서 **[Install to Workspace]** 버튼을 누릅니다.
5. `허용(Allow)` 버튼을 누르면 설치가 완료됩니다.
6. 이제 **Bot User OAuth Token** (`xoxb-`로 시작하는 긴 글자)이 나타납니다. 이 값을 복사해 둡니다.

---

## 4. 환경 변수(.env) 설정하기

코드에 중요한 비밀번호를 바로 적어두는 건 위험합니다. 안전하게 관리하기 위해 설정을 변경합니다.

1. 다운받은 폴더 안을 보면 `.env.example` 이라는 파일이 있습니다.
2. 이 파일의 이름을 `.env` 로 변경합니다. (이름 바꾸기 단축키: F2)
3. `.env` 파일을 열고 아까 복사해둔 값들로 수정합니다.
   ```text
   SLACK_BOT_TOKEN=xoxb-여기에-토큰을-붙여넣으세요
   SLACK_SIGNING_SECRET=여기에-시크릿을-붙여넣으세요
   PORT=3000
   ```
4. 파일을 **저장**합니다. (단축키: Ctrl + S)

---

## 5. 서버 실행하기

이제 봇의 뇌 역할을 할 우리 서버를 켜볼 차례입니다.

1. 아까 열어둔 VS Code의 터미널에 아래 명령어를 치고 엔터를 누릅니다.
   ```bash
   npm start
   ```
2. `🚀 Slack 봇 서버가 포트 3000에서 실행 중입니다!` 라는 글자가 뜨면 성공입니다! (이 터미널 창은 계속 켜두세요)

---

## 6. 외부에서 내 컴퓨터로 접속하게 만들기 (ngrok)

Slack이 우리 컴퓨터(서버)에 메시지 알림을 주려면, 우리 컴퓨터가 인터넷에 공개된 주소가 있어야 합니다. `ngrok`이라는 도구를 쓰면 아주 쉽게 만들 수 있습니다.

1. **[ngrok 회원가입 및 다운로드](https://ngrok.com/)**: 사이트에 가서 회원가입 후 ngrok 프로그램을 다운받습니다.
2. ngrok 압축을 풀고 프로그램을 실행합니다. (까만색 터미널 창이 뜹니다)
3. ngrok 홈페이지 대시보드에 있는 `ngrok config add-authtoken 본인토큰` 명령어를 복사해서 붙여넣고 엔터를 칩니다. (최초 1회만 하면 됨)
4. 이제 아래 명령어를 치고 엔터를 누릅니다.
   ```bash
   ngrok http 3000
   ```
5. 화면에 `Forwarding` 항목 옆에 `https://어쩌구저쩌구.ngrok-free.app` 같은 임시 인터넷 주소가 생깁니다. 이 **https 주소를 복사**해 둡니다.

---

## 7. Slack에 우리 서버 주소 알려주기 (이벤트 구독)

마지막 단계입니다! Slack에 "누가 메시지 쓰면 방금 만든 그 주소로 알려줘!"라고 설정합니다.

1. 다시 **[Slack API 페이지](https://api.slack.com/apps)** 로 가서 방금 만든 앱을 누릅니다.
2. 왼쪽 메뉴에서 **[Event Subscriptions]**를 클릭합니다.
3. **Enable Events** 스위치를 `On`으로 켭니다.
4. **Request URL** 칸에 방금 복사한 ngrok 주소 뒤에 `/slack/events`를 붙여서 넣습니다.
   - 예시: `https://1a2b3c4d.ngrok-free.app/slack/events`
5. 잠시 기다리면 초록색 글씨로 **Verified** 라고 뜨면 성공입니다! (우리 서버가 잘 켜져있고, 코드 3번 요구사항인 URL Verification을 잘 통과했다는 뜻입니다)
6. 바로 아래 **Subscribe to bot events** 섹션에서 **[Add Bot User Event]**를 클릭하고 `message.channels`를 선택합니다.
7. 화면 우측 하단의 노란색 **[Save Changes]** 버튼을 꼭 클릭합니다.
8. 상단에 노란 배너로 "reinstall your app" 어쩌구 뜨면 해당 링크를 눌러서 다시 한번 `허용(Allow)` 해줍니다.

---

## 🎉 완성! 테스트 해보기

1. Slack 프로그램을 켭니다.
2. 아무 공개 채널(예: `#일반`)에 들어갑니다.
3. 봇을 채널에 초대해야 합니다. 채팅창에 `@방금만든봇이름` 을 치고 엔터를 누르면 "채널에 추가하시겠습니까?"가 뜹니다. 추가를 누릅니다.
4. 채팅창에 `안녕` 이라고 쳐보세요!
5. 봇이 `안녕하세요! 봇이 작동 중입니다 🤖` 라고 대답하면 모든 것이 완벽하게 완성된 것입니다!
