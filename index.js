require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

// 새롭게 분리된 모듈들을 불러옵니다.
const { sendMessage } = require('./utils/slackClient');
const { handleDesignMessage, handleDesignCompletion } = require('./channels/design');

const app = express();
const port = process.env.PORT || 3000;

// ---------------------------------------------------------
// 미들웨어: Slack 서명 검증용 원본 데이터(rawBody) 추출
// (JSON과 URL-Encoded 형태 두 가지 모두 지원해야 합니다)
// ---------------------------------------------------------
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf.toString(); }
}));

app.use(express.urlencoded({
  extended: true,
  verify: (req, res, buf) => { req.rawBody = buf.toString(); }
}));

// ---------------------------------------------------------
// [보안 필수] Slack 서명 검증 미들웨어
// ---------------------------------------------------------
const verifySlackSignature = (req, res, next) => {
  const slackSignature = req.headers['x-slack-signature'];
  const slackTimestamp = req.headers['x-slack-request-timestamp'];

  if (!slackSignature || !slackTimestamp) {
    return res.status(401).send('Verification failed: No headers');
  }

  const time = Math.floor(new Date().getTime() / 1000);
  if (Math.abs(time - slackTimestamp) > 300) {
    return res.status(401).send('Verification failed: Request too old');
  }

  const sigBasestring = 'v0:' + slackTimestamp + ':' + req.rawBody;
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', process.env.SLACK_SIGNING_SECRET)
    .update(sigBasestring, 'utf8')
    .digest('hex');

  if (crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(slackSignature))) {
    next();
  } else {
    return res.status(401).send('Verification failed: Signature mismatch');
  }
};

// ---------------------------------------------------------
// 엔드포인트 1: 일반 채팅 메시지 및 이벤트 처리 (/slack/events)
// ---------------------------------------------------------
app.post('/slack/events', verifySlackSignature, async (req, res) => {
  const { type, challenge, event } = req.body;

  // URL Verification (초기 세팅용)
  if (type === 'url_verification') {
    return res.status(200).send(challenge);
  }

  if (type === 'event_callback') {
    // 봇 자신이 보낸 메시지 무시
    if (event.bot_id) return res.status(200).send();

    if (event.type === 'message' && event.text) {
      const channelId = event.channel;
      
      // [긴급 디버깅용 로그] 슬랙에서 어떤 채널 ID로 보냈는지, 현재 환경변수에 등록된 ID는 뭔지 확인
      console.log(`[디버그] 방금 메시지가 온 채널 ID: ${channelId}`);
      console.log(`[디버그] 현재 서버에 등록된 DESIGN_CHANNEL_ID: ${process.env.DESIGN_CHANNEL_ID}`);
      
      // ---------------------------------------------------------
      // 중앙 라우팅 (Central Routing)
      // 향후 .env 파일에 채널 ID를 넣어두고 동적으로 판단하도록 수정합니다.
      // (지금은 임시로 .env 의 DESIGN_CHANNEL_ID를 기준으로 분기합니다)
      // ---------------------------------------------------------
      const targetChannelId = (process.env.DESIGN_CHANNEL_ID || '').trim();
      
      if (channelId === targetChannelId) {
        
        // 봇을 멘션하여 "완료"라고 달린 스레드 댓글인지 확인 (예: "<@U12345> 완료")
        if (event.thread_ts && event.text.includes('완료')) {
          await handleDesignCompletion(event);
        } else if (!event.thread_ts) {
          // 스레드가 아닌 일반 채팅인 경우 (새로운 요청)
          await handleDesignMessage(event);
        }

      }
      
      // 추가 채널(진료일정, 마케팅 등) 라우팅은 이곳에 추가됩니다.
    }
  }

  res.status(200).send();
});

// ---------------------------------------------------------
// 엔드포인트 2: DM의 버튼 클릭(인터랙션) 처리 (/slack/interactions)
// ---------------------------------------------------------
app.post('/slack/interactions', verifySlackSignature, async (req, res) => {
  // 인터랙션 페이로드는 URL-Encoded 형식의 'payload' 키 안에 JSON 문자열로 들어옵니다.
  const payload = JSON.parse(req.body.payload);
  
  if (payload.type === 'block_actions') {
    const action = payload.actions[0];
    const actionId = action.action_id;
    const userSlackId = payload.user.id;

    // 액션 ID가 디자인 채널의 승인/반려 버튼인 경우
    if (actionId.startsWith('design_approve_') || actionId.startsWith('design_reject_')) {
      const parts = actionId.split('_');
      const decision = parts[1]; // approve 또는 reject
      const originalChannel = parts[2];
      const originalTs = parts[3];

      if (decision === 'approve') {
        // 원본 스레드에 승인 결과 메시지 전송
        await sendMessage(originalChannel, `<@${userSlackId}> 님이 승인을 완료했습니다. 디자인 작업이 최종 종료됩니다! 🎉`, originalTs);
      } else {
        // 반려 시
        await sendMessage(originalChannel, `⚠️ <@${userSlackId}> 님이 반려하셨습니다. 내용 확인 후 재작업 부탁드립니다.`, originalTs);
      }
    }
  }
  
  // 성공적으로 처리했음을 Slack에 응답
  res.status(200).send();
});

// 서버 실행
app.listen(port, '0.0.0.0', () => {
  console.log(`=========================================`);
  console.log(`🚀 병원 마케팅 Slack 에이전트 (포트: ${port})`);
  console.log(`=========================================`);
});
