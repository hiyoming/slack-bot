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

// Calls Gemini API to generate a natural language reply using hospital context
async function callGemini(hospital, userText) {
    const managers = (hospital.internal_managers || []).join(', ') || 'N/A';
    const systemPrompt = [
        `You are the Slack assistant for "${hospital.hospital_name}".`,
        `Lead doctor: ${hospital.representative_doctor || 'N/A'}`,
        `Department: ${hospital.department || 'N/A'}`,
        `Internal managers: ${managers}`,
        '답변은 반드시 한국어로, 간결하고 실무적으로 작성하세요. 모르는 정보는 모른다고 답하세요.'
        ].join('\n');

if (!process.env.GEMINI_API_KEY) {
    console.error('[hospitalChat] GEMINI_API_KEY is not set.');
    return '아직 대화 기능이 완전히 설정되지 않았습니다. 관리자에게 문의해주세요. (GEMINI_API_KEY 미설정)';
}

try {
        const model = 'gemini-1.5-flash';    
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
    const text = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
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

const reply = await callGemini(hospital, cleanText);
    await sendMessage(event.channel, reply, event.thread_ts || event.ts);
}

module.exports = {
    isHospitalChannel,
    getHospitalByChannelId,
    handleHospitalChat
};
