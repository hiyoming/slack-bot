const fs = require('fs');
const path = require('path');
const { sendMessage } = require('../utils/slackClient');
const { getMarketingStatusSummary, getHospitalTasks } = require('../utils/intraClient');

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
// 마케팅 현황 조회 키워드 감지
// 사용자가 "마케팅 현황", "업무 현황", "현황 알려줘" 등을 물어보면
// 인트라 API를 통해 실제 데이터를 가져옵니다.
// ---------------------------------------------------------
const MARKETING_STATUS_KEYWORDS = [
  '마케팅 현황', '업무 현황', '현황 알려줘', '현황 보여줘',
  '지금 뭐하고 있어', '진행 현황', '이번 달 현황',
  '진행 중인 업무', '진행중인 업무', '업무 목록',
  '마케팅 상황', '작업 현황',
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
    '마케팅 현황은 "현황 알려줘"라고 물어보면 인트라 연동으로 제공됩니다.',
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
    console.log(`[hospitalChat] 마케팅 현황 조회 요청 감지 - 인트라 API 호출`);

    if (!process.env.INTRA_ACCESS_TOKEN) {
      await sendMessage(event.channel,
        '⚠️ 인트라 연동이 설정되지 않았습니다. Railway Variables에 `INTRA_ACCESS_TOKEN`을 추가해주세요.',
        event.thread_ts || event.ts);
      return;
    }

    const summary = await getMarketingStatusSummary(hospital.hospital_name);
    await sendMessage(event.channel, summary, event.thread_ts || event.ts);
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
