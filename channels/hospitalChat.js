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
  '마케팅 현황', '광고 현황', '데일리 체크', '데일리체크', '데일리업무', '데일리 업무'
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
  
  let additionalContext = '';
  
  try {
    const normalize = (name) => {
      if (!name) return '';
      return name.replace(/\s/g, '')
                 .replace(/의원/g, '')
                 .replace(/산부인과/g, '')
                 .replace(/피부과/g, '')
                 .replace(/성형외과/g, '')
                 .replace(/치과/g, '')
                 .replace(/안과/g, '')
                 .replace(/한의원/g, '')
                 .replace(/클리닉/g, '');
    };

    const isMatch = (apiName, hospName) => {
      const a = normalize(apiName);
      const b = normalize(hospName);
      return a.includes(b) || b.includes(a) || a === b;
    };
    
    // 플레이스/순위 관련 질문 시 데이터 주입
    if (userText.includes('플레이스') || userText.includes('순위')) {
      const { intraFetch } = require('../utils/intraClient');
      const placeRank = await intraFetch('/api/monitoring/place-rank').catch(() => null);
      if (placeRank && placeRank.items) {
        const placeData = placeRank.items.filter(i => isMatch(i.hosp_name, hospital.hospital_name));
        if (placeData.length > 0) {
          additionalContext += '\n[네이버 플레이스 현재 순위 데이터]\n';
          placeData.forEach(item => {
            additionalContext += `- 키워드 '${item.search_keyword}': 현재 ${item.today_rank}위 (목표 ${item.target_rank}위)\n`;
          });
        }
      }
    }

    // 광고/예산/잔액 관련 질문 시 데이터 주입
    if (userText.includes('광고') || userText.includes('예산') || userText.includes('잔액')) {
      const { intraFetch } = require('../utils/intraClient');
      const [naver, kakao, google] = await Promise.all([
        intraFetch('/api/monitoring/ad-info/naver').catch(() => null),
        intraFetch('/api/monitoring/ad-info/kakao').catch(() => null),
        intraFetch('/api/monitoring/ad-info/google').catch(() => null),
      ]);
      
      additionalContext += '\n[광고 예산 및 잔액 데이터]\n';
      
      const addAdData = (platformName, data) => {
        if (data && data.items) {
          const items = data.items.filter(i => isMatch(i.hosp_name, hospital.hospital_name));
          items.forEach(item => {
            additionalContext += `- ${platformName}: 잔액 ${Number(item.balance || 0).toLocaleString()}원, 전일 소진액 ${Number(item.spending_yesterday || 0).toLocaleString()}원, 월 예산 ${Number(item.monthly_advertise || 0).toLocaleString()}원\n`;
          });
        }
      };
      
      addAdData('네이버', naver);
      addAdData('카카오', kakao);
      addAdData('구글', google);
    }
    // 홈페이지 관련 질문 시 데이터 주입
    if (userText.includes('홈페이지') || userText.includes('접속')) {
      const { intraFetch } = require('../utils/intraClient');
      const homepages = await intraFetch('/api/monitoring/homepages').catch(() => null);
      if (homepages && homepages.items) {
        const homeData = homepages.items.filter(i => isMatch(i.hosp_name, hospital.hospital_name));
        if (homeData.length > 0) {
          additionalContext += '\n[홈페이지 접속 상태 데이터]\n';
          homeData.forEach(item => {
            additionalContext += `- ${item.domain}: 접속 상태 ${item.last_ping_ok ? '정상(OK)' : '에러(접속 불가)'}\n`;
          });
        }
      }
    }
    // 보고서 관련 질문 시 데이터 주입
    if (userText.includes('보고서')) {
      const { getHospitalReports } = require('../utils/intraClient');
      const reports = await getHospitalReports(hospital.hospital_name).catch(() => []);
      if (reports.length > 0) {
        additionalContext += '\n[월간 보고서 작성 현황 데이터]\n';
        reports.forEach(r => {
          const title = `${r.title_prefix || ''} ${r.report_year}년 ${r.report_month}월 보고서 ${r.title_suffix || ''}`.trim();
          if (!r.image_count || r.image_count === 0) {
            additionalContext += `- [${title}] 미작성 (캡쳐 없음)\n`;
          } else {
            additionalContext += `- [${title}] ${r.confirmed ? '확인 완료' : '미확인'}, 캡쳐(이미지) ${r.image_count}장\n`;
          }
        });
      }
    }

    // 업무(태스크) 관련 질문 시 데이터 주입
    if (userText.includes('업무') || userText.includes('요청')) {
      const { getHospitalTasks } = require('../utils/intraClient');
      const tasks = await getHospitalTasks(hospital.hospital_name, 10).catch(() => []);
      if (tasks.length > 0) {
        additionalContext += '\n[요청 업무 현황 데이터 (최근 10건)]\n';
        tasks.forEach(t => {
          additionalContext += `- [${t.cat}] ${t.ti} (상태: ${t.st}, 담당: ${t.asgn || '미배정'})\n`;
        });
      }
    }
  } catch (err) {
    console.error('[hospitalChat] Context injection failed:', err);
  }

  const systemPrompt = [
    `당신은 "${hospital.hospital_name}"의 Slack 업무 보조 에이전트입니다.`,
    `대표원장: ${hospital.representative_doctor || 'N/A'}`,
    `진료과목: ${hospital.department || 'N/A'}`,
    `홈페이지: ${hospital.homepage_url || 'N/A'}`,
    `블로그: ${hospital.blog_url || 'N/A'}`,
    `내부 담당자: ${managers}`,
    '답변은 반드시 한국어로 작성하세요.',
    '[매우 중요한 규칙]: "안녕하세요", "감사합니다", "안내해 드립니다", "추가 문의 사항이 있으시다면" 등 일체의 인사말, 맺음말, 수식어, 불필요한 붙임말을 절대 사용하지 마세요. 오직 사용자가 묻는 말에 대한 핵심 데이터와 결론만 가장 건조하고 간결하게(단답형 수준으로) 출력하세요.',
    '사용자가 순위, 광고 예산, 혹은 홈페이지 상태 등을 물어보면 아래 제공된 [데이터]를 바탕으로 답변하세요. 사용자가 특정 날짜를 언급하더라도, 제공된 최신 데이터를 기준으로 답변하세요. 제공된 데이터가 없다면 "데이터 없음" 이라고만 답변하세요.',
    additionalContext
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

  // 디버그: 네이버 광고에 등록된 병원 이름 전체 확인
  if (cleanText === '디버그광고') {
    const { intraFetch } = require('../utils/intraClient');
    const naver = await intraFetch('/api/monitoring/ad-info/naver').catch(() => null);
    if (!naver || !naver.items) {
      await sendMessage(event.channel, '네이버 광고 API에서 데이터를 가져오지 못했습니다 (또는 items가 없음).', event.thread_ts);
      return;
    }
    const names = [...new Set(naver.items.map(i => i.hosp_name))];
    await sendMessage(event.channel, `[디버그] 네이버 광고에 등록된 병원 이름 목록:\n${names.join(', ')}`, event.thread_ts);
    return;
  }

  // 마케팅 현황 조회 요청이면 인트라 API 우선 호출
  if (isMarketingStatusRequest(cleanText)) {
    console.log(`[hospitalChat] 데일리 체크 요청 감지 - 인트라 API 호출`);

    if (!process.env.INTRA_ACCESS_TOKEN) {
      await sendMessage(event.channel,
        '⚠️ 인트라 연동이 설정되지 않았습니다. Railway Variables에 `INTRA_ACCESS_TOKEN`을 추가해주세요.',
        event.thread_ts);
      return;
    }

    const { report } = await getDailyCheckReport(hospital.hospital_name);
    await sendMessage(event.channel, report, event.thread_ts);
    return;
  }

  // 일반 질문은 Gemini AI로 응답
  const reply = await callGemini(hospital, cleanText);
  await sendMessage(event.channel, reply, event.thread_ts);
}

module.exports = {
  isHospitalChannel,
  getHospitalByChannelId,
  handleHospitalChat,
};
