const { WebClient } = require('@slack/web-api');

// 서버 환경변수(process.env)에서 봇 토큰을 가져와 WebClient를 초기화합니다.
const web = new WebClient(process.env.SLACK_BOT_TOKEN);

/**
 * 특정 채널에 일반 텍스트 메시지를 보내는 함수
 * @param {string} channel - 보낼 채널 ID (예: 'C01234567')
 * @param {string} text - 보낼 메시지 내용
 * @param {string} thread_ts - (옵션) 스레드에 답글을 달 때 사용하는 부모 메시지의 타임스탬프
 */
async function sendMessage(channel, text, thread_ts = null) {
  try {
    const config = { channel, text };
    if (thread_ts) config.thread_ts = thread_ts;
    await web.chat.postMessage(config);
  } catch (error) {
    console.error(`[Slack API 에러] sendMessage 실패:`, error);
  }
}

/**
 * 특정 사용자에게 개인 메시지(DM)를 보내는 함수 (버튼 등의 블록 포함 가능)
 * @param {string} userId - 사용자 슬랙 ID (예: 'U01234567')
 * @param {string} text - 알림 푸시용 텍스트 (모바일 알림에 표시됨)
 * @param {Array} blocks - (옵션) Slack Block Kit을 이용한 버튼/UI 배열
 */
async function sendDM(userId, text, blocks = null) {
  try {
    // 1. 유저와의 1:1 대화방(DM 채널)을 엽니다.
    const conversation = await web.conversations.open({ users: userId });
    
    // 2. 열린 대화방 ID로 메시지를 보냅니다.
    const msgConfig = { channel: conversation.channel.id, text };
    if (blocks) msgConfig.blocks = blocks;
    
    await web.chat.postMessage(msgConfig);
  } catch (error) {
    console.error(`[Slack API 에러] sendDM 실패 (userId: ${userId}):`, error);
  }
}

/**
 * 스레드의 원본(첫 번째) 메시지를 가져오는 함수
 * @param {string} channel - 채널 ID
 * @param {string} thread_ts - 스레드 타임스탬프
 * @returns {Object} 원본 메시지 객체
 */
async function getOriginalMessage(channel, thread_ts) {
  try {
    const result = await web.conversations.replies({
      channel: channel,
      ts: thread_ts,
      limit: 1 // 첫 번째 메시지만 가져오기
    });
    return result.messages[0];
  } catch (error) {
    console.error(`[Slack API 에러] getOriginalMessage 실패:`, error);
    return null;
  }
}

module.exports = {
  web,
  sendMessage,
  sendDM,
  getOriginalMessage
};
