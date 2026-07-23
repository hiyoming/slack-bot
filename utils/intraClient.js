// utils/intraClient.js
// 디뉴 인트라넷 API 클라이언트
// 토큰은 Railway 환경변수(INTRA_ACCESS_TOKEN, INTRA_REFRESH_TOKEN, INTRA_CSRF_TOKEN)에서 읽어옵니다.

const BASE_URL = 'https://intra.dnew.co.kr';

/**
 * 인트라 API 공통 호출 함수
 */
async function intraFetch(endpoint) {
  const token = process.env.INTRA_ACCESS_TOKEN;
  const csrf = process.env.INTRA_CSRF_TOKEN;
  const refresh = process.env.INTRA_REFRESH_TOKEN;

  if (!token) {
    console.error('[intraClient] INTRA_ACCESS_TOKEN 환경변수가 설정되지 않았습니다.');
    return null;
  }

  const cookie = `access_token=${token}; csrf_token=${csrf || ''}; refresh_token=${refresh || ''}`;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Cookie': cookie,
    'Content-Type': 'application/json',
    'x-csrf-token': csrf || '',
  };

  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, { headers });
    if (!res.ok) {
      console.error(`[intraClient] API 오류 ${res.status}: ${endpoint}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`[intraClient] 요청 실패: ${endpoint}`, err.message);
    return null;
  }
}

/**
 * 특정 병원의 최근 업무(태스크) 목록 조회
 */
async function getHospitalTasks(hospitalName, limit = 30) {
  const tasks = await intraFetch('/api/tasks');
  if (!tasks) return [];

  const clean = (s) => (s || '').replace(/\s/g, '');
  const filtered = tasks.filter(t => clean(t.hosp).includes(clean(hospitalName)));
  return filtered.slice(0, limit);
}

/**
 * 특정 병원의 이번 달 보고서 현황 조회
 */
async function getHospitalReports(hospitalName) {
  const reports = await intraFetch('/api/reports');
  if (!reports) return [];

  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;
  const clean = (s) => (s || '').replace(/\s/g, '');

  return reports.filter(r =>
    clean(r.hospital_name).includes(clean(hospitalName)) &&
    r.report_year === thisYear &&
    r.report_month === thisMonth
  );
}

/**
 * 마케팅 현황 요약 텍스트 생성 (Slack 메시지용)
 */
async function getMarketingStatusSummary(hospitalName) {
  const [tasks, reports] = await Promise.all([
    getHospitalTasks(hospitalName, 30),
    getHospitalReports(hospitalName),
  ]);

  if (tasks.length === 0 && reports.length === 0) {
    return `인트라에서 *${hospitalName}* 관련 업무 데이터를 찾지 못했습니다.`;
  }

  const inProgress = tasks.filter(t => t.st !== '완료');
  const completed = tasks.filter(t => t.st === '완료');

  // 카테고리별 집계
  const byCategory = {};
  tasks.forEach(t => {
    const cat = t.cat || '기타';
    if (!byCategory[cat]) byCategory[cat] = { total: 0, done: 0 };
    byCategory[cat].total++;
    if (t.st === '완료') byCategory[cat].done++;
  });

  const now = new Date();
  const monthStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;
  const lines = [];

  lines.push(`📊 *${hospitalName}* 마케팅 현황 (최근 ${tasks.length}건)`);
  lines.push('');

  if (inProgress.length > 0) {
    lines.push(`🔄 *진행 중* (${inProgress.length}건)`);
    inProgress.slice(0, 5).forEach(t => {
      lines.push(`  • [${t.cat}] ${t.ti} — 담당: ${t.asgn || '미배정'}`);
    });
    if (inProgress.length > 5) lines.push(`  ... 외 ${inProgress.length - 5}건`);
    lines.push('');
  }

  if (completed.length > 0) {
    lines.push(`✅ *최근 완료* (총 ${completed.length}건 중 최신 3건)`);
    completed.slice(0, 3).forEach(t => {
      lines.push(`  • [${t.cat}] ${t.ti} (${(t.dt || '').substring(0, 10)})`);
    });
    lines.push('');
  }

  if (Object.keys(byCategory).length > 0) {
    lines.push(`📂 *카테고리별 요약*`);
    Object.entries(byCategory).forEach(([cat, stat]) => {
      lines.push(`  • ${cat}: ${stat.done}/${stat.total}건 완료`);
    });
    lines.push('');
  }

  if (reports.length > 0) {
    const r = reports[0];
    const confirmed = r.confirmed ? '✅ 확인 완료' : '⏳ 미확인';
    lines.push(`📋 *${monthStr} 보고서*: ${confirmed} (${r.page_count}페이지, 이미지 ${r.image_count}장)`);
  } else {
    lines.push(`📋 *${monthStr} 보고서*: 아직 생성되지 않음`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------
// 데일리 체크 (이상 감지) 기능
// ---------------------------------------------------------

/**
 * 네이버 소진율 편차(%) 계산
 */
function calculateNaverDeviations(item, latestDay) {
  if (!item.monthly_advertise || item.monthly_advertise <= 0) return null;

  const targetDate = new Date(latestDay);
  const chargeDay = item.charge_day || 1;
  let chargeDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), chargeDay);
  if (targetDate < chargeDate) {
    chargeDate.setMonth(chargeDate.getMonth() - 1);
  }
  
  // 충전일로부터 지난 일수 (최소 1일)
  const diffTime = Math.abs(targetDate - chargeDate);
  let daysPassed = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  const dailyExpected = item.monthly_advertise / 30;
  
  const dailyDev = ((item.spending_yesterday / dailyExpected) * 100) - 100;
  const weekDev = ((item.spending_week / (dailyExpected * 7)) * 100) - 100;
  const periodDev = ((item.spending_period / (dailyExpected * daysPassed)) * 100) - 100;

  return { dailyDev, weekDev, periodDev };
}

/**
 * 병원의 마케팅 이상 감지 데일리 체크 보고서 생성
 */
async function getDailyCheckReport(hospitalName) {
  const [tasks, reports, naver, kakao, google, placeRank, homepages] = await Promise.all([
    getHospitalTasks(hospitalName, 30),
    getHospitalReports(hospitalName),
    intraFetch('/api/monitoring/ad-info/naver').catch(() => null),
    intraFetch('/api/monitoring/ad-info/kakao').catch(() => null),
    intraFetch('/api/monitoring/ad-info/google').catch(() => null),
    intraFetch('/api/monitoring/place-rank').catch(() => null),
    intraFetch('/api/monitoring/homepages').catch(() => null)
  ]);

  const clean = (s) => (s || '').replace(/\s/g, '');
  const cleanHosp = clean(hospitalName);
  
  const anomalies = [];

  // 1. 네이버 광고 이상 감지
  if (naver && naver.items) {
    const naverData = naver.items.filter(i => clean(i.hosp_name).includes(cleanHosp));
    naverData.forEach(item => {
      // 잔액 부족 체크 (한달 광고액의 20% 이하)
      if (item.balance <= item.monthly_advertise * 0.2) {
        anomalies.push(`🔴 *[네이버 광고]* 잔액 부족 (예산의 20% 이하): 현재 ${item.balance.toLocaleString()}원 남음`);
      }
      
      // 소진율 체크
      const devs = calculateNaverDeviations(item, naver.latest_day);
      if (devs) {
        // 충전일, 1일, 1주일 모두 ±40% 범위를 벗어나면 보고
        const isDailyOut = Math.abs(devs.dailyDev) >= 40;
        const isWeekOut = Math.abs(devs.weekDev) >= 40;
        const isPeriodOut = Math.abs(devs.periodDev) >= 40;
        
        if (isDailyOut && isWeekOut && isPeriodOut) {
           anomalies.push(`🟡 *[네이버 광고]* 소진율 이상: 1일(${devs.dailyDev > 0 ? '+' : ''}${Math.round(devs.dailyDev)}%), 1주일(${devs.weekDev > 0 ? '+' : ''}${Math.round(devs.weekDev)}%), 충전일(${devs.periodDev > 0 ? '+' : ''}${Math.round(devs.periodDev)}%) 모두 ±40% 이탈`);
        }
      }
    });
  }

  // 2. 카카오 광고 이상 감지
  if (kakao && kakao.items) {
    const kakaoData = kakao.items.filter(i => clean(i.hosp_name).includes(cleanHosp));
    kakaoData.forEach(item => {
      if (item.balance <= 5000) {
        anomalies.push(`🔴 *[카카오 광고]* 잔액 부족: 5,000원 이하 (${(item.balance || 0).toLocaleString()}원)`);
      }
      if (item.spending_yesterday >= item.monthly_advertise * 0.5) {
        anomalies.push(`🟡 *[카카오 광고]* 과다 소진: 전일 소진액이 한달 예산의 50% 이상 (${(item.spending_yesterday || 0).toLocaleString()}원)`);
      }
    });
  }

  // 3. 구글 광고 이상 감지
  if (google && google.items) {
    const googleData = google.items.filter(i => clean(i.hosp_name).includes(cleanHosp));
    googleData.forEach(item => {
      if (item.balance <= 10000) {
        anomalies.push(`🔴 *[구글 광고]* 잔액 부족: 10,000원 이하 (${(item.balance || 0).toLocaleString()}원)`);
      }
      if (item.spending_yesterday >= item.monthly_advertise * 0.3) {
        anomalies.push(`🟡 *[구글 광고]* 과다 소진: 전일 소진액이 한달 예산의 30% 이상 (${(item.spending_yesterday || 0).toLocaleString()}원)`);
      }
    });
  }

  // 4. 플레이스 순위 체크
  if (placeRank && placeRank.items) {
    const placeData = placeRank.items.filter(i => clean(i.hosp_name).includes(cleanHosp));
    placeData.forEach(item => {
      // today_rank와 target_rank가 다르면 보고 (순위 변동)
      if (item.today_rank && String(item.today_rank) !== String(item.target_rank)) {
        anomalies.push(`📍 *[네이버 플레이스]* 순위 변동: '${item.search_keyword}' 현재 ${item.today_rank}위 (목표 ${item.target_rank}위)`);
      }
    });
  }

  // 5. 홈페이지 접속 체크
  if (homepages && homepages.items) {
    const homeData = homepages.items.filter(i => clean(i.hosp_name).includes(cleanHosp));
    homeData.forEach(item => {
      if (item.last_ping_ok === false) {
        anomalies.push(`🚨 *[홈페이지]* 접속 불가 감지: ${item.domain}`);
      }
    });
  }

  // 결과 조합
  let lines = [];
  lines.push(`🏥 *${hospitalName} 데일리 마케팅 현황*`);
  lines.push(`───────────────────────────`);
  
  const hasAnomaly = anomalies.length > 0;
  
  if (hasAnomaly) {
    lines.push(`⚠️ *이상 항목 ${anomalies.length}건 발견*`);
    lines.push('');
    anomalies.forEach(a => lines.push(a));
  } else {
    lines.push(`✅ *이상 없음*: 광고 예산, 플레이스 순위, 홈페이지 접속 모두 정상입니다.`);
  }

  return { hasAnomaly, report: lines.join('\n') };
}

module.exports = {
  intraFetch,
  getHospitalTasks,
  getHospitalReports,
  getMarketingStatusSummary,
  getDailyCheckReport,
};
