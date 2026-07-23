require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

// 새롭게 분리된 모듈들을 불러옵니다.
const { sendMessage } = require('./utils/slackClient');
const { handleDesignMessage, handleDesignCompletion } = require('./channels/design');
const { handleScheduleMessage, handleScheduleCompletion } = require('./channels/schedule');
const { handleHospitalChat, isHospitalChannel } = require('./channels/hospitalChat');

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

  // 슬랙 재시도 요청 무시 (3초 내 응답 못 받으면 슬랙이 같은 이벤트를 재전송함)
  // 재시도는 처리하지 않고 즉시 200만 반환합니다.
  if (req.headers['x-slack-retry-num']) {
    console.log(`[중복방지] 슬랙 재시도 요청 무시 (retry: ${req.headers['x-slack-retry-num']})`);
    return res.status(200).send();
  }

  if (type === 'event_callback') {
    // 봇 자신이 보낸 메시지 무시
    if (event.bot_id) return res.status(200).send();

    if (event.type === 'message' && event.text) {
      const channelId = event.channel;

      // 슬랙에 즉시 200 응답 (3초 이내 응답 안 하면 슬랙이 재시도함)
      res.status(200).send();

      // 이후 처리는 비동기로 진행 (응답은 이미 완료)
      const targetChannelId = (process.env.DESIGN_CHANNEL_ID || '').replace(/[^A-Z0-9]/ig, '');
      const scheduleChannelId = (process.env.SCHEDULE_CHANNEL_ID || '').replace(/[^A-Z0-9]/ig, '');
      const cleanChannelId = (channelId || '').replace(/[^A-Z0-9]/ig, '');

      console.log(`[라우팅] 채널: ${cleanChannelId}`);

      if (cleanChannelId === targetChannelId) {
        if (event.thread_ts && event.text.includes('완료')) {
          await handleDesignCompletion(event);
        } else if (!event.thread_ts) {
          await handleDesignMessage(event);
        }
      } else if (cleanChannelId === scheduleChannelId) {
        if (event.thread_ts) {
          await handleScheduleCompletion(event);
        } else {
          await handleScheduleMessage(event);
        }
      } else if (isHospitalChannel(cleanChannelId)) {
        console.log(`[라우팅] 병원 채널 → 대화형 처리`);
        await handleHospitalChat(event, cleanChannelId);
      } else {
        console.log(`[라우팅] 등록되지 않은 채널, 무시됨.`);
      }

      return; // res는 이미 전송됨
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
