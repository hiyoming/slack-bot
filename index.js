// 환경 변수(.env 파일)를 불러옵니다.
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { WebClient } = require('@slack/web-api');

// Express 웹 서버 초기화
const app = express();
const port = process.env.PORT || 3000;

// Slack Web API 클라이언트 초기화 (메시지 보낼 때 사용)
// .env 파일에 저장된 SLACK_BOT_TOKEN을 사용합니다.
const web = new WebClient(process.env.SLACK_BOT_TOKEN);

// ---------------------------------------------------------
// [보안 필수] Slack 서명 검증 함수
// 이 요청이 정말로 Slack에서 보낸 요청인지 확인합니다.
// ---------------------------------------------------------
const verifySlackSignature = (req, res, next) => {
  const slackSignature = req.headers['x-slack-signature'];
  const slackTimestamp = req.headers['x-slack-request-timestamp'];

  // 1. 서명이나 타임스탬프 헤더가 아예 없으면 에러 처리
  if (!slackSignature || !slackTimestamp) {
    console.error('Slack 서명 헤더가 누락되었습니다.');
    return res.status(401).send('Verification failed');
  }

  // 2. 요청이 너무 오래된 경우 (5분 초과 시 무시 - 재전송 공격 방지용)
  const time = Math.floor(new Date().getTime() / 1000);
  if (Math.abs(time - slackTimestamp) > 300) {
    console.error('너무 오래된 요청입니다.');
    return res.status(401).send('Request is too old');
  }

  // 3. 서명 생성 및 비교
  // v0:타임스탬프:원본데이터 형식으로 문자열을 만듭니다.
  const sigBasestring = 'v0:' + slackTimestamp + ':' + req.rawBody;
  
  // SLACK_SIGNING_SECRET을 이용해 암호화(HMAC SHA256)를 진행합니다.
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', process.env.SLACK_SIGNING_SECRET)
    .update(sigBasestring, 'utf8')
    .digest('hex');

  // 내가 만든 서명과 Slack이 보낸 서명이 일치하는지 안전하게 비교합니다.
  if (crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(slackSignature))) {
    next(); // 일치하면 다음 단계로 넘어갑니다.
  } else {
    console.error('Slack 서명이 일치하지 않습니다.');
    return res.status(401).send('Verification failed');
  }
};

// ---------------------------------------------------------
// 미들웨어 설정
// 서명 검증을 위해서는 데이터가 변형되기 전의 "원본 데이터(raw body)"가 필요합니다.
// ---------------------------------------------------------
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString(); // 원본 데이터를 req.rawBody에 저장
  }
}));

// ---------------------------------------------------------
// Slack Events API 엔드포인트
// Slack에서 어떤 이벤트가 발생하면 이곳으로 데이터를 보내줍니다.
// ---------------------------------------------------------
// '/slack/events' 주소로 POST 요청이 오면 먼저 서명을 검증(verifySlackSignature)합니다.
app.post('/slack/events', verifySlackSignature, async (req, res) => {
  const { type, challenge, event } = req.body;

  // 1. URL Verification (URL 검증) 처리
  // 처음에 Slack에 이 서버 URL을 등록할 때, Slack이 확인용으로 challenge 값을 보냅니다.
  // 이 값을 그대로 돌려주면 "내 서버 정상 작동함"이라고 인증하는 것입니다.
  if (type === 'url_verification') {
    return res.status(200).send(challenge);
  }

  // 2. 실제 메시지 이벤트 처리
  if (type === 'event_callback') {
    
    // 봇 자신이 보낸 메시지는 무시합니다. (안 그러면 무한루프에 빠질 수 있습니다!)
    if (event.bot_id) {
      return res.status(200).send();
    }

    // 채널에 누군가 텍스트 메시지를 보냈을 경우
    if (event.type === 'message' && event.text) {
      
      // 메시지 내용에 "안녕"이 포함되어 있는지 검사
      if (event.text.includes('안녕')) {
        try {
          // 메시지가 온 바로 그 채널(event.channel)에 답장을 보냅니다.
          await web.chat.postMessage({
            channel: event.channel,
            text: '안녕하세요! 봇이 작동 중입니다 🤖'
          });
          console.log(`채널(${event.channel})에 안녕 메시지를 보냈습니다!`);
        } catch (error) {
          console.error('메시지 전송 중 오류 발생:', error);
        }
      }
    }
  }

  // Slack은 3초 이내에 200 OK 응답을 받아야 안심합니다. (응답이 없으면 계속 다시 보냅니다)
  res.status(200).send();
});

// ---------------------------------------------------------
// 서버 시작
// ---------------------------------------------------------
app.listen(port, () => {
  console.log(`=========================================`);
  console.log(`🚀 Slack 봇 서버가 포트 ${port}에서 실행 중입니다!`);
  console.log(`=========================================`);
});
