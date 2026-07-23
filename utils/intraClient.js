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

module.exports = {
  intraFetch,
  getHospitalTasks,
  getHospitalReports,
  getMarketingStatusSummary,
};
