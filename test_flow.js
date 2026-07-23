const handleDesignMessage = async (event) => {
  console.log(`[디버그] 채널 원본 메시지 텍스트:`, event.text);
}

const handleDesignCompletion = async (event) => {
  console.log(`[디버그] 스레드 원본 메시지 텍스트:`, event.text);
}

const event = {
  type: 'message',
  text: '테스트',
  channel: 'C0BK78ACNQA'
};

const channelId = event.channel;
const targetChannelId = 'C0BK78ACNQA';

if (channelId === targetChannelId) {
  if (event.thread_ts && event.text.includes('완료')) {
    handleDesignCompletion(event);
  } else if (!event.thread_ts) {
    handleDesignMessage(event);
  } else {
    console.log("IT SKIPPED BOTH");
  }
}
