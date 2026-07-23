const fs = require('fs');
const path = require('path');
const { sendMessage } = require('../utils/slackClient');
const { getDailyCheckReport, getHospitalTasks } = require('../utils/intraClient');

const channelsPath = path.join(__dirname, '../data/hospitalChannels.json');

// Loads hospital channel mapping from JSON
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

// ---------------------------------------------------------
// 데일리 체크 키워드 감지
// 사용자가 아래 키워드를 물어보면
// 인트라 API를 통해 이상 감지 보고서를 생성합니다.
// ---------------------------------------------------------
const MARKETING_STATUS_KEYWORDS = [
  '마케팅 현황', '광고 현황', '현황 알려줘', '현황 보여줘',
  '데일리 체크', '데일리체크', '데일리업무', '데일리 업무'
];

function isMarketingStatusRequest(text) {
  const clean = text.toLowerCase().replace(/\s/g, '');
  return MARKETING_STATUS_KEYWORDS.some(kw =>
    clean.includes(kw.toLowerCase().replace(/\s/g, ''))
  );
}

// Calls Gemini API to generate a natural language reply using hospital context
async function callGemini(hospital, userText) {
  const managers = (hospital.internal_managers || []).join(', ') || 'N/A';
  const systemPrompt = [
    `당신은 "${hospital.hospital_name}"의 Slack 업무 보조 에이전트입니다.`,
    `대표원장: ${hospital.representative_doctor || 'N/A'}`,
    `진료과목: ${hospital.department || 'N/A'}`,
    `홈페이지: ${hospital.homepage_url || 'N/A'}`,
    `블로그: ${hospital.blog_url || 'N/A'}`,
    `내부 담당자: ${managers}`,
    '답변은 반드시 한국어로, 간결하고 실무적으로 작성하세요.',
    '모르는 정보는 모른다고 답하세요.',
    '현황 체크는 "데일리 체크"라고 물어보면 인트라 연동으로 자동 제공됩니다.',
  ].join('\n');

  if (!process.env.GEMINI_API_KEY) {
    console.error('[hospitalChat] GEMINI_API_KEY is not set.');
    return '아직 대화 기능이 완전히 설정되지 않았습니다. (GEMINI_API_KEY 미설정)';
  }

  try {
    const model = 'gemini-3.6-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[hospitalChat] Gemini API error', response.status, errText);
      return '죄송합니다, 지금 응답을 생성하는 중 오류가 발생했습니다.';
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text || '응답을 생성하지 못했습니다.';
  } catch (error) {
    console.error('[hospitalChat] Gemini API call failed', error);
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

  // 마케팅 현황 조회 요청이면 인트라 API 우선 호출
  if (isMarketingStatusRequest(cleanText)) {
    console.log(`[hospitalChat] 데일리 체크 요청 감지 - 인트라 API 호출`);

    if (!process.env.INTRA_ACCESS_TOKEN) {
      await sendMessage(event.channel,
        '⚠️ 인트라 연동이 설정되지 않았습니다. Railway Variables에 `INTRA_ACCESS_TOKEN`을 추가해주세요.',
        event.thread_ts || event.ts);
      return;
    }

    const { report } = await getDailyCheckReport(hospital.hospital_name);
    await sendMessage(event.channel, report, event.thread_ts || event.ts);
    return;
  }

  // 일반 질문은 Gemini AI로 응답
  const reply = await callGemini(hospital, cleanText);
  await sendMessage(event.channel, reply, event.thread_ts || event.ts);
}

module.exports = {
  isHospitalChannel,
  getHospitalByChannelId,
  handleHospitalChat,
};
