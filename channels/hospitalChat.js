const fs = require('fs');
const path = require('path');
const { sendMessage } = require('../utils/slackClient');

const channelsPath = path.join(__dirname, '../data/hospitalChannels.json');

// Loads hospital channel mapping from JSON (replace with intranet API later)
function loadHospitalChannels() {
    try {
          return JSON.parse(fs.readFileSync(channelsPath, 'utf8'));
    } catch (error) {
          console.error('Failed to read hospitalChannels.json:', error);
          return [];
    }
}

function getHospitalByChannelId(channelId) {
    const list = loadHospitalChannels();
    return list.find(h => h.channel_id === channelId);
}

function isHospitalChannel(channelId) {
    return !!getHospitalByChannelId(channelId);
}

// Calls Claude API to generate a natural language reply using hospital context
async function callClaude(hospital, userText) {
    const managers = (hospital.internal_managers || []).join(', ') || 'N/A';
    const systemPrompt = [
          `You are the Slack assistant for "${hospital.hospital_name}".`,
          `Lead doctor: ${hospital.representative_doctor || 'N/A'}`,
          `Department: ${hospital.department || 'N/A'}`,
          `Internal managers: ${managers}`,
          '답변은 반드시 한국어로, 간결하고 실무적으로 작성하세요. 모르는 정보는 모른다고 답하세요.'
        ].join('\n');

  if (!process.env.ANTHROPIC_API_KEY) {
        console.error('[hospitalChat] ANTHROPIC_API_KEY is not set.');
        return '아직 대화 기능이 완전히 설정되지 않았습니다. 관리자에게 문의해주세요. (ANTHROPIC_API_KEY 미설정)';
  }

  try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                          'Content-Type': 'application/json',
                          'x-api-key': process.env.ANTHROPIC_API_KEY,
                          'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                          model: 'claude-sonnet-4-5-20250929',
                          max_tokens: 1024,
                          system: systemPrompt,
                          messages: [{ role: 'user', content: userText }]
                })
        });

      if (!response.ok) {
              const errText = await response.text();
              console.error('[hospitalChat] Claude API error', response.status, errText);
              return '죄송합니다, 지금 응답을 생성하는 중 오류가 발생했습니다.';
      }

      const data = await response.json();
        return (data && data.content && data.content[0] && data.content[0].text) || '응답을 생성하지 못했습니다.';
  } catch (error) {
        console.error('[hospitalChat] Claude API call failed', error);
        return '죄송합니다, 지금 응답을 생성하는 중 오류가 발생했습니다.';
  }
}

// Handles a new message posted in a registered hospital channel
async function handleHospitalChat(event, cleanChannelId) {
    const hospital = getHospitalByChannelId(cleanChannelId);
    if (!hospital) return;

  const cleanText = (event.text || '').replace(/<@[^>]+>/g, '').trim();
    if (!cleanText) return;

  console.log(`[hospitalChat] message from ${hospital.hospital_name}: ${cleanText}`);

  const reply = await callClaude(hospital, cleanText);
    await sendMessage(event.channel, reply, event.thread_ts || event.ts);
}

module.exports = {
    isHospitalChannel,
    getHospitalByChannelId,
    handleHospitalChat
};
