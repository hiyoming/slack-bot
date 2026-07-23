const channelId = 'C0BK78ACNQA';
const envVar = 'C0BK78ACNQA\r'; // simulating railway copy-paste with carriage return

console.log(`[디버그] 방금 메시지가 온 채널 ID: ${channelId}`);
console.log(`[디버그] 현재 서버에 등록된 DESIGN_CHANNEL_ID: ${envVar}`);

const targetChannelId = (envVar || '').trim();
console.log(`Are they equal? ${channelId === targetChannelId}`);

if (channelId === targetChannelId) {
  console.log("IT ENTERED THE IF BLOCK");
} else {
  console.log("IT DID NOT ENTER THE IF BLOCK");
}
